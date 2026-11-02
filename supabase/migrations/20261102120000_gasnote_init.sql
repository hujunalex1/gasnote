-- 加油记账 · Supabase 初始化
--
-- 用法（二选一）：
--   1. 打开 Supabase Dashboard → SQL Editor → 粘贴整个文件 → Run（一次就够，重复跑也安全）
--   2. 用 Supabase CLI：先在本地 supabase init、supabase link，再 supabase db push
--
-- 设计要点：
--   * 一条加油记录 = 一行。金额用 numeric 而不是 float，避免 0.1 + 0.2 这类误差。
--   * 每张表都开 RLS，策略只认 auth.uid()，别人即使拿到 anon key 也读不到你的数据。
--   * 客户端不直接 DELETE/INSERT 一堆行，而是调用 gasnote_push 整份替换：
--     一个事务里先删掉云端多出来的行、再 upsert 当前所有行、最后 revision + 1。
--     这样同步永远是「整份快照」语义，和导出/导入的 JSON 完全一致。
--   * revision 用来判断「云端有没有被别的设备改过」，比比较时间戳可靠（不受本机时钟影响）。

-- ---------------------------------------------------------------------------
-- 1. 记录表
-- ---------------------------------------------------------------------------

create table if not exists public.gasnote_records (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,
  date       date        not null,
  amount     numeric(12, 2) not null,
  note       text        not null default '',
  odometer   integer,
  liters     numeric(10, 2),
  -- 「这次是否加满」。不叫 full 是因为 full 是 SQL 关键字，每次都得加引号
  is_full    boolean,
  updated_at timestamptz not null default now(),
  constraint gasnote_records_pkey primary key (user_id, id),
  constraint gasnote_records_id_not_empty check (length(id) between 1 and 128),
  constraint gasnote_records_amount_positive check (amount > 0),
  constraint gasnote_records_odometer_positive check (odometer is null or odometer > 0),
  constraint gasnote_records_liters_positive check (liters is null or liters > 0)
);

comment on table public.gasnote_records is '加油记录，一条一行；user_id 决定归属，RLS 按 auth.uid() 隔离';
comment on column public.gasnote_records.odometer is '仪表盘总里程 km，整数，选填';
comment on column public.gasnote_records.is_full is '这次是否加满；选填，缺省按加满算';

-- 主键 (user_id, id) 已经能给 RLS 的 user_id 过滤提供索引，
-- 这条额外索引服务于「按日期列出某个用户的记录」这个唯一的读路径。
create index if not exists gasnote_records_user_date_idx
  on public.gasnote_records (user_id, date desc);

-- ---------------------------------------------------------------------------
-- 2. 同步版本号（每个用户一行）
-- ---------------------------------------------------------------------------

create table if not exists public.gasnote_sync (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  revision   bigint      not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.gasnote_sync is
  '每个用户一行：revision 在每次整份替换后 +1，客户端据此判断云端是否被别处改过';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.gasnote_records enable row level security;
alter table public.gasnote_sync    enable row level security;

-- (select auth.uid()) 而不是裸 auth.uid()：后者会被当成每行求值一次，
-- 包一层子查询之后是一次求值、全语句复用。
drop policy if exists gasnote_records_owner on public.gasnote_records;
create policy gasnote_records_owner on public.gasnote_records
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists gasnote_sync_owner on public.gasnote_sync;
create policy gasnote_sync_owner on public.gasnote_sync
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. 拉取：一次往返拿到 { revision, records }
-- ---------------------------------------------------------------------------

create or replace function public.gasnote_pull()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'revision', coalesce(
      (select s.revision from public.gasnote_sync s where s.user_id = (select auth.uid())),
      0
    ),
    'records', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id',       g.id,
                   'date',     to_char(g.date, 'YYYY-MM-DD'),
                   'amount',   g.amount,
                   'note',     g.note,
                   'odometer', g.odometer,
                   'liters',   g.liters,
                   'full',     g.is_full
                 )
                 order by g.date, g.id
               )
        from public.gasnote_records g
        where g.user_id = (select auth.uid())
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.gasnote_pull() is
  '返回当前用户的全部记录与云端 revision；未登录时记录为空数组、revision 为 0';

-- ---------------------------------------------------------------------------
-- 5. 推送：整份替换 + revision + 1，返回新的 revision
-- ---------------------------------------------------------------------------

create or replace function public.gasnote_push(p_records jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_revision bigint;
  v_upserted bigint;
begin
  if v_uid is null then
    raise exception '未登录：无法写入云端记录' using errcode = '28000';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records 必须是 JSON 数组' using errcode = '22023';
  end if;

  -- 正常使用几百条就到头了。上限只是防止一次误调用把库写爆。
  if jsonb_array_length(p_records) > 50000 then
    raise exception '单次最多 50000 条记录' using errcode = '22023';
  end if;

  -- 整份替换。client 保证 id 唯一，这里仍去一次重：
  -- 同一个 id 出现两次会让 ON CONFLICT DO UPDATE 报「不能影响同一行两次」。
  with incoming as (
    select distinct on (v.id)
      v.id, v.date, v.amount, v.note, v.odometer, v.liters, v.is_full
    from (
      select
        (e.value ->> 'id')::text                    as id,
        (e.value ->> 'date')::date                  as date,
        (e.value ->> 'amount')::numeric             as amount,
        coalesce(e.value ->> 'note', '')            as note,
        nullif(e.value ->> 'odometer', '')::integer as odometer,
        nullif(e.value ->> 'liters', '')::numeric   as liters,
        (e.value ->> 'full')::boolean               as is_full,
        e.ord
      from jsonb_array_elements(p_records) with ordinality as e(value, ord)
    ) v
    order by v.id, v.ord
  ),
  removed as (
    delete from public.gasnote_records as g
    where g.user_id = v_uid
      and not exists (select 1 from incoming i where i.id = g.id)
    returning g.id
  ),
  upserted as (
    insert into public.gasnote_records
      (user_id, id, date, amount, note, odometer, liters, is_full)
    select v_uid, i.id, i.date, i.amount, i.note, i.odometer, i.liters, i.is_full
    from incoming i
    on conflict (user_id, id) do update
      set date       = excluded.date,
          amount     = excluded.amount,
          note       = excluded.note,
          odometer   = excluded.odometer,
          liters     = excluded.liters,
          is_full    = excluded.is_full,
          updated_at = now()
    returning 1
  )
  select count(*) into v_upserted from upserted;

  insert into public.gasnote_sync (user_id, revision, updated_at)
  values (v_uid, 1, now())
  on conflict (user_id) do update
    set revision   = gasnote_sync.revision + 1,
        updated_at = now()
  returning revision into v_revision;

  return v_revision;
end;
$$;

comment on function public.gasnote_push(jsonb) is
  '用传入的记录整份替换当前用户的云端数据，返回新的 revision；任何一条不合法则整体回滚';

-- ---------------------------------------------------------------------------
-- 6. 权限：只给登录用户，anon 一律拒绝
-- ---------------------------------------------------------------------------

revoke all on public.gasnote_records from anon;
revoke all on public.gasnote_sync    from anon;
grant select, insert, update, delete on public.gasnote_records to authenticated;
grant select, insert, update, delete on public.gasnote_sync    to authenticated;

revoke all on function public.gasnote_pull()        from public, anon;
revoke all on function public.gasnote_push(jsonb)   from public, anon;
grant execute on function public.gasnote_pull()      to authenticated;
grant execute on function public.gasnote_push(jsonb) to authenticated;
