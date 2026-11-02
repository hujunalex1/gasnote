import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideSync, markDirty, markSynced, parseSyncMeta, readSyncMeta, writeSyncMeta,
  readLastCopied, writeLastCopied, shouldRemindBackup,
  SYNC_META_KEY, LAST_COPIED_KEY, STALE_DAYS, DAY_MS,
  type SyncMeta,
} from '../src/lib/sync.ts';

const DAY = 24 * 60 * 60 * 1000;

/** 只实现三个方法的假存储，跟 store.test.ts 里 store 的用法一致。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

const meta = (over: Partial<SyncMeta> = {}): SyncMeta => ({
  email: 'a@example.com',
  remoteRevision: 3,
  dirty: false,
  lastSyncedAt: 1000,
  ...over,
});

// ---- decideSync：这是整个同步的决策核心，任何一条错都会丢数据 ----

test('decideSync：从没同步过、两边都没有数据 → 什么都不用做', () => {
  assert.equal(decideSync({ meta: null, localCount: 0, remoteCount: 0, remoteRevision: 0 }), 'nothing');
});

test('decideSync：从没同步过、只有本机有数据 → 推送（首次迁移）', () => {
  assert.equal(decideSync({ meta: null, localCount: 5, remoteCount: 0, remoteRevision: 0 }), 'push');
});

test('decideSync：从没同步过、只有云端有数据 → 拉取（新设备）', () => {
  assert.equal(decideSync({ meta: null, localCount: 0, remoteCount: 5, remoteRevision: 7 }), 'pull');
});

// 这条是安全底线：本机有旧账、又登录了一个已经有数据的账号，
// 自动推送会把云端那份整份覆盖掉。必须问用户。
test('decideSync：从没同步过、两边都有数据 → 冲突，绝不自动选边', () => {
  assert.equal(decideSync({ meta: null, localCount: 5, remoteCount: 8, remoteRevision: 2 }), 'conflict');
});

test('decideSync：本机干净且 revision 一致 → 无事可做', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4 }), localCount: 9, remoteCount: 9, remoteRevision: 4 }),
    'nothing',
  );
});

test('decideSync：本机干净但云端 revision 变了 → 拉取（别的设备改过）', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4 }), localCount: 9, remoteCount: 10, remoteRevision: 5 }),
    'pull',
  );
});

test('decideSync：本机有改动、云端没动 → 推送', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4, dirty: true }), localCount: 10, remoteCount: 9, remoteRevision: 4 }),
    'push',
  );
});

test('decideSync：本机有改动、云端也动了 → 冲突', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4, dirty: true }), localCount: 10, remoteCount: 11, remoteRevision: 5 }),
    'conflict',
  );
});

// 云端变空了也是一次真实的改动（在别处删光了），不能当成「没数据所以推上去」。
test('decideSync：云端被清空、本机干净 → 仍然拉取，而不是推送', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4 }), localCount: 9, remoteCount: 0, remoteRevision: 5 }),
    'pull',
  );
});

test('decideSync：本机删光了且 revision 没变 → 推送空列表', () => {
  assert.equal(
    decideSync({ meta: meta({ remoteRevision: 4, dirty: true }), localCount: 0, remoteCount: 3, remoteRevision: 4 }),
    'push',
  );
});

// ---- markDirty / markSynced ----

test('markDirty：置为脏，且不改变其它字段', () => {
  const before = meta({ dirty: false });
  const after = markDirty(before);
  assert.equal(after.dirty, true);
  assert.equal(after.remoteRevision, before.remoteRevision);
  assert.equal(after.email, before.email);
  assert.equal(after.lastSyncedAt, before.lastSyncedAt);
});

test('markDirty：已经是脏的就原样返回（不制造新对象）', () => {
  const before = meta({ dirty: true });
  assert.equal(markDirty(before), before);
});

test('markSynced：清掉脏标记、记下 revision 与时刻', () => {
  const after = markSynced(meta({ dirty: true, remoteRevision: 2 }), 'a@example.com', 9, 12345);
  assert.deepEqual(after, {
    email: 'a@example.com',
    remoteRevision: 9,
    dirty: false,
    lastSyncedAt: 12345,
  });
});

test('markSynced：没有旧元信息时也能建立一份（首次登录）', () => {
  const after = markSynced(null, 'b@example.com', 1, 777);
  assert.deepEqual(after, {
    email: 'b@example.com',
    remoteRevision: 1,
    dirty: false,
    lastSyncedAt: 777,
  });
});

test('markSynced：调用方没给邮箱时保留旧归属', () => {
  const after = markSynced(meta({ email: 'c@example.com' }), null, 5, 1);
  assert.equal(after.email, 'c@example.com');
});

// ---- parseSyncMeta：半对半错的元信息比没有更危险 ----

test('parseSyncMeta：合法数据原样解析', () => {
  const parsed = parseSyncMeta({ email: 'a@example.com', remoteRevision: 2, dirty: true, lastSyncedAt: 99 });
  assert.deepEqual(parsed, { email: 'a@example.com', remoteRevision: 2, dirty: true, lastSyncedAt: 99 });
});

test('parseSyncMeta：lastSyncedAt 可以是 null（同步过但没记时间）', () => {
  const parsed = parseSyncMeta({ email: null, remoteRevision: 0, dirty: false, lastSyncedAt: null });
  assert.deepEqual(parsed, { email: null, remoteRevision: 0, dirty: false, lastSyncedAt: null });
});

test('parseSyncMeta：空字符串邮箱当作没有邮箱', () => {
  assert.equal(parseSyncMeta({ email: '', remoteRevision: 0, dirty: false, lastSyncedAt: null })!.email, null);
});

test('parseSyncMeta：缺字段 / 类型不对一律作废', () => {
  for (const bad of [
    null,
    undefined,
    'x',
    42,
    [],
    {},
    { remoteRevision: 0, dirty: false },                              // 缺 lastSyncedAt
    { email: 'a@b.c', remoteRevision: -1, dirty: false, lastSyncedAt: null },
    { email: 'a@b.c', remoteRevision: 1.5, dirty: false, lastSyncedAt: null },
    { email: 'a@b.c', remoteRevision: '3', dirty: false, lastSyncedAt: null },
    { email: 'a@b.c', remoteRevision: 3, dirty: 'no', lastSyncedAt: null },
    { email: 'a@b.c', remoteRevision: 3, dirty: false, lastSyncedAt: 'yesterday' },
    { email: 'a@b.c', remoteRevision: 3, dirty: false, lastSyncedAt: Infinity },
  ]) {
    assert.equal(parseSyncMeta(bad), null, `应作废: ${JSON.stringify(bad)}`);
  }
});

test('parseSyncMeta：多余字段被丢掉，不污染结果', () => {
  const parsed = parseSyncMeta({
    email: 'a@b.c', remoteRevision: 1, dirty: false, lastSyncedAt: null, hacker: 'yes',
  });
  assert.deepEqual(Object.keys(parsed!).sort(), ['dirty', 'email', 'lastSyncedAt', 'remoteRevision']);
});

// ---- 元信息的读写 ----

test('readSyncMeta：没存过 → null', () => {
  assert.equal(readSyncMeta(fakeStorage()), null);
});

test('writeSyncMeta 与 readSyncMeta 往返一致', () => {
  const storage = fakeStorage();
  const value = meta({ dirty: true, remoteRevision: 12 });
  writeSyncMeta(storage, value);
  assert.deepEqual(readSyncMeta(storage), value);
  assert.ok(storage.map.get(SYNC_META_KEY));
});

test('writeSyncMeta(null)：把键删掉，不是写个 null 字符串', () => {
  const storage = fakeStorage({ [SYNC_META_KEY]: '{"remoteRevision":1}' });
  writeSyncMeta(storage, null);
  assert.equal(storage.getItem(SYNC_META_KEY), null);
  assert.equal(readSyncMeta(storage), null);
});

test('readSyncMeta：坏 JSON 当作没同步过，不抛异常', () => {
  assert.equal(readSyncMeta(fakeStorage({ [SYNC_META_KEY]: '{oops' })), null);
});

test('readSyncMeta：结构不对的 JSON 也当作没同步过', () => {
  const storage = fakeStorage({ [SYNC_META_KEY]: '{"remoteRevision":-2,"dirty":false,"lastSyncedAt":null}' });
  assert.equal(readSyncMeta(storage), null);
});

// ---- 手动导出的时刻 ----

test('readLastCopied：没存过 → null', () => {
  assert.equal(readLastCopied(fakeStorage()), null);
});

test('writeLastCopied 与 readLastCopied 往返一致', () => {
  const storage = fakeStorage();
  writeLastCopied(storage, 1700000000000);
  assert.equal(readLastCopied(storage), 1700000000000);
  assert.ok(storage.map.get(LAST_COPIED_KEY));
});

test('readLastCopied：非数字 / 负数 / 0 都算没有', () => {
  for (const raw of ['abc', '-5', '0', 'NaN', '']) {
    assert.equal(readLastCopied(fakeStorage({ [LAST_COPIED_KEY]: raw })), null, `应拒绝: ${raw}`);
  }
});

// ---- shouldRemindBackup ----

test('shouldRemindBackup：没有记录时不提醒（没东西可丢）', () => {
  assert.equal(shouldRemindBackup(null, Date.now(), 0), false);
  assert.equal(shouldRemindBackup(0, Date.now(), 0), false);
});

test('shouldRemindBackup：有记录但从未拿到副本 → 提醒', () => {
  assert.equal(shouldRemindBackup(null, Date.now(), 3), true);
});

test('shouldRemindBackup：超过阈值才提醒', () => {
  const now = Date.now();
  assert.equal(shouldRemindBackup(now - (STALE_DAYS - 1) * DAY, now, 1), false);
  assert.equal(shouldRemindBackup(now - STALE_DAYS * DAY, now, 1), false, '正好等于阈值不算"超过"');
  assert.equal(shouldRemindBackup(now - (STALE_DAYS + 1) * DAY, now, 1), true);
});

test('shouldRemindBackup：时钟回拨（副本时间在未来）不提醒', () => {
  const now = Date.now();
  assert.equal(shouldRemindBackup(now + 100 * DAY, now, 5), false);
});

test('shouldRemindBackup：刚好压线的一刻', () => {
  const now = Date.now();
  assert.equal(shouldRemindBackup(now - STALE_DAYS * DAY - 1, now, 1), true);
  assert.equal(shouldRemindBackup(now - STALE_DAYS * DAY + 1, now, 1), false);
});

test('shouldRemindBackup：阈值可注入', () => {
  const now = Date.now();
  assert.equal(shouldRemindBackup(now - 2 * DAY, now, 1, 3), false);
  assert.equal(shouldRemindBackup(now - 4 * DAY, now, 1, 3), true);
});

test('DAY_MS 就是一天的毫秒数', () => {
  assert.equal(DAY_MS, 86400000);
});
