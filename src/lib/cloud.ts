// Supabase 的浏览器适配层：登录、拉取、推送，以及把各种错误翻成人话。
//
// 这里刻意不进单测（和 fileBackup.ts / storage.ts 的分工一致）：它除了转发什么都不判断，
// 真正需要被钉死的规则在 sync.ts 里。集成验证靠浏览器里真的登录一次。
//
// @supabase/supabase-js 用动态 import：没配置 Supabase 的人完全不会下载这 ~100KB。
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeRecords } from './store.ts'
import type { FuelRecord } from './types.ts'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
/**
 * Supabase 从 2025 起用 publishable key（`sb_publishable_…`）替代旧的 anon JWT key，
 * 旧 key 到 2026 年底弃用。两个变量名都认，新名字优先。
 * 两种 key 的权限一模一样（都只到 anon / authenticated 角色），安全性都靠 RLS。
 */
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** 云端返回的数据形状完全由我们自己控制，但线上可能是旧版本，所以仍然走一遍校验。 */
export type CloudSnapshot = { revision: number; records: FuelRecord[] }

export type CloudResult<T> = { ok: true; value: T } | { ok: false; error: string }

function fail<T>(error: string): CloudResult<T> {
  return { ok: false, error }
}

/** 环境变量有没有配。没配时界面会直接说明，而不是等到同步时抛个看不懂的错。 */
export function isCloudConfigured(): boolean {
  return SUPABASE_URL !== '' && SUPABASE_KEY !== ''
}

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null

/** 单次请求的上限。没有它，网络半死不活时按钮会永远停在「请稍候…」，用户连重试都点不了。 */
const REQUEST_TIMEOUT_MS = 20_000

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return fetch(input, init)
  }
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

async function getClient(): Promise<SupabaseClient | null> {
  if (!isCloudConfigured()) return null
  if (client !== null) return client
  loading ??= import('@supabase/supabase-js').then(({ createClient }) => {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { fetch: fetchWithTimeout },
      auth: {
        // 登录态放 localStorage，刷新页面不用重新登录；token 到点自动续期。
        persistSession: true,
        autoRefreshToken: true,
        // 本项目不用邮件里的魔法链接，关掉它可以避免 URL 里残留的 token 干扰路由。
        detectSessionInUrl: false,
        storageKey: 'gasnote.auth.v1',
      },
    })
    return client
  })
  return loading
}

const NOT_CONFIGURED =
  '没有配置 Supabase：请在 .env.local 里填 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY 后重新构建。'

// ---- 登录态 ----

export async function getSignedInEmail(): Promise<string | null> {
  const supabase = await getClient()
  if (supabase === null) return null
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data.session?.user.email ?? null
  } catch {
    return null
  }
}

/**
 * 订阅登录态变化（token 过期被清、在别的标签页退出登录都会触发）。
 * 返回取消订阅的函数。
 */
export async function onAuthChange(
  callback: (email: string | null) => void,
): Promise<() => void> {
  const supabase = await getClient()
  if (supabase === null) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user.email ?? null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string): Promise<CloudResult<null>> {
  const supabase = await getClient()
  if (supabase === null) return fail(NOT_CONFIGURED)
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return fail(describeCloudError(error))
    return { ok: true, value: null }
  } catch (error) {
    return fail(describeCloudError(error))
  }
}

/** 注册结果里需要区分「要先去邮箱点确认」——那时候还没有会话，不能立刻同步。 */
export type SignUpOutcome = { needsConfirm: boolean }

export async function signUp(
  email: string,
  password: string,
): Promise<CloudResult<SignUpOutcome>> {
  const supabase = await getClient()
  if (supabase === null) return fail(NOT_CONFIGURED)
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return fail(describeCloudError(error))
    // 项目开了邮箱确认时，signUp 成功但不返回 session，此时还不能同步。
    return { ok: true, value: { needsConfirm: data.session === null } }
  } catch (error) {
    return fail(describeCloudError(error))
  }
}

export async function signOut(): Promise<void> {
  const supabase = await getClient()
  if (supabase === null) return
  try {
    await supabase.auth.signOut()
  } catch {
    /* 退不掉也要让界面回到未登录——本地会话已经在内存里清掉了 */
  }
}

// ---- 同步 ----

/** 拉取云端全部记录与 revision。一次往返，够用。 */
export async function pullCloud(): Promise<CloudResult<CloudSnapshot>> {
  const supabase = await getClient()
  if (supabase === null) return fail(NOT_CONFIGURED)
  try {
    const { data, error } = await supabase.rpc('gasnote_pull')
    if (error) return fail(describeCloudError(error))
    return parseSnapshot(data)
  } catch (error) {
    return fail(describeCloudError(error))
  }
}

function parseSnapshot(data: unknown): CloudResult<CloudSnapshot> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('云端返回的数据格式不对（不是对象）。本机数据没有被改动。')
  }
  const payload = data as Record<string, unknown>
  const revision = payload.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
    return fail('云端返回的同步版本号不合法。本机数据没有被改动。')
  }
  // 服务端把选填字段写成了 null，normalizeRecords 会忽略它们，正好对上可选语义。
  const normalized = normalizeRecords(payload.records)
  if (!normalized.ok) {
    return fail(`云端有读不懂的记录：${normalized.error}。本机数据没有被改动，请先在 Supabase 里检查。`)
  }
  return { ok: true, value: { revision, records: normalized.records } }
}

/** 整份推上去，返回云端的新 revision。 */
export async function pushCloud(records: FuelRecord[]): Promise<CloudResult<number>> {
  const supabase = await getClient()
  if (supabase === null) return fail(NOT_CONFIGURED)
  const payload = records.map((record) => ({
    id: record.id,
    date: record.date,
    amount: record.amount,
    note: record.note,
    odometer: record.odometer ?? null,
    liters: record.liters ?? null,
    full: record.full ?? null,
  }))
  try {
    const { data, error } = await supabase.rpc('gasnote_push', { p_records: payload })
    if (error) return fail(describeCloudError(error))
    const revision = typeof data === 'number' ? data : Number(data)
    if (!Number.isInteger(revision) || revision < 1) {
      return fail('云端没有返回合法的同步版本号，这次推送可能没生效。')
    }
    return { ok: true, value: revision }
  } catch (error) {
    return fail(describeCloudError(error))
  }
}

// ---- 错误翻译 ----

type Errorish = { message?: unknown; code?: unknown; name?: unknown }

/**
 * 把 Supabase / PostgREST / 网络 / 鉴权的各种错误翻成一句能照着做的话。
 * 用户看不懂 "JWT expired" 或 "PGRST301"，但看得懂「登录已过期」。
 */
export function describeCloudError(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as Errorish
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : String(error)

  if (code === '28000' || code === 'PGRST301' || /jwt|not authenticated/i.test(message)) {
    return '登录已过期，请重新登录后再同步。本机数据没有改动。'
  }
  if (code === '42P01' || code === '42883' || /could not find the (table|function)/i.test(message)) {
    return '云端还没有建表：请先在 Supabase 的 SQL Editor 里执行 supabase/migrations 下的那个 SQL 文件。'
  }
  if (code === '23514') {
    return '云端拒绝了一条不合法的记录（金额或里程必须大于 0），整份推送已回滚，本机数据没有改动。'
  }
  if (code === '22023') {
    return '云端拒绝了这次请求：记录格式不对。本机数据没有改动。'
  }
  if (/row-level security/i.test(message)) {
    return '云端拒绝了这次写入（RLS 策略不通过）。请确认已经登录，并且 SQL 里的 RLS 策略已生效。'
  }
  if (/Invalid login credentials/i.test(message)) {
    return '邮箱或密码不对。第一次用请先「注册」。'
  }
  if (/Email not confirmed/i.test(message)) {
    return '这个账号还没验证邮箱：请先去邮箱里点确认链接，再回来登录。'
  }
  if (/User already registered/i.test(message)) {
    return '这个邮箱已经注册过了，直接登录即可。'
  }
  if (/Password should be at least/i.test(message)) {
    return '密码太短，至少 6 位。'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return '请求太频繁，被 Supabase 限流了。等几分钟再试。'
  }
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)) {
    return '连不上 Supabase（网络断了或被浏览器拦了）。改动仍存在本机，联网后会自动重试。'
  }
  if (/abort|timeout|timed out/i.test(message)) {
    return '请求超时了。可能是网络太慢或 Supabase 暂时没响应，稍后再试。改动仍存在本机。'
  }
  return `云端返回错误：${message}`
}
