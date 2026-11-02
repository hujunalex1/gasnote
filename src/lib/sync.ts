// 云同步的纯逻辑层：只回答「这一轮该推、该拉、还是该让用户选」，
// 以及元信息（revision / dirty）怎么读写。不 import Supabase、不碰网络。
// 真正的请求在 cloud.ts（薄适配层），那份靠浏览器里的手动验证覆盖。
//
// 分工与 store.ts / storage.ts 一致：能单测的都放在这里。
import type { StorageLike } from './store.ts'

export const SYNC_META_KEY = 'gasnote.sync.v1'

/** 手动导出时记下时刻，同样算「已经有一份数据副本」。 */
export const LAST_COPIED_KEY = 'gasnote.copied.v1'

/** 多久没拿到数据副本就提醒（天）。 */
export const STALE_DAYS = 14

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 同步元信息，存在 localStorage 里。
 *
 * email 是「这份 revision 属于哪个账号」的凭据：换账号登录时如果沿用旧 revision，
 * 会把 A 账的云端版本号当成 B 账的，同步决策立刻错乱，所以换账号必须丢弃整份元信息。
 */
export type SyncMeta = {
  email: string | null
  /** 上次成功同步时云端的 revision */
  remoteRevision: number
  /** 本机有尚未推送到云端的改动 */
  dirty: boolean
  /** 上次成功同步的时刻（本机时钟），只用于显示和过期提醒 */
  lastSyncedAt: number | null
}

export type SyncAction = 'push' | 'pull' | 'nothing' | 'conflict'

/**
 * 决定这一轮怎么同步。四种结果：
 *
 * - `push`：本机是权威副本，整份推上去。
 * - `pull`：云端是权威副本（别的设备改过，或本机从没同步过），拉下来覆盖本机。
 * - `nothing`：两边一致，不用动。
 * - `conflict`：两边都改过。**绝不自动选一边**，交给用户决定——自动选边就是静默丢数据。
 *
 * `meta === null` 表示这台浏览器没有可信的同步记录（从没同步过，或元信息坏了）。
 * 此时本地和云端都有数据是最危险的场景（新设备装了旧账本、又登录了老账号），
 * 必须问用户，而不是拿本地去覆盖云端。
 */
export function decideSync(input: {
  meta: SyncMeta | null
  localCount: number
  remoteCount: number
  remoteRevision: number
}): SyncAction {
  const { meta, localCount, remoteCount, remoteRevision } = input

  if (meta === null) {
    if (remoteCount === 0) return localCount > 0 ? 'push' : 'nothing'
    if (localCount === 0) return 'pull'
    return 'conflict'
  }

  if (!meta.dirty) {
    return meta.remoteRevision === remoteRevision ? 'nothing' : 'pull'
  }

  return meta.remoteRevision === remoteRevision ? 'push' : 'conflict'
}

/** 标记本机有改动，下次同步要推送。 */
export function markDirty(meta: SyncMeta): SyncMeta {
  return meta.dirty ? meta : { ...meta, dirty: true }
}

/**
 * 一次成功同步（推或拉）之后的新元信息。
 *
 * 允许 meta 为 null：首次登录、本地还没建立元信息时也要能记下这一次的结果。
 * email 由调用方传入，避免把上一个账号的归属留在里面。
 */
export function markSynced(
  meta: SyncMeta | null,
  email: string | null,
  remoteRevision: number,
  now: number,
): SyncMeta {
  return {
    email: email ?? meta?.email ?? null,
    remoteRevision,
    dirty: false,
    lastSyncedAt: now,
  }
}

/**
 * 校验并规整一份元信息。任何一处不合法就整份作废（返回 null）。
 *
 * 为什么宁可变回「没有可信记录」：一份半对半错的 revision 比没有更危险——
 * 它会让 decideSync 得出 `nothing`，把真实的差异永久掩盖掉。
 * 而 null 走的是「两边都有数据就问用户」那条最保守的路径。
 */
export function parseSyncMeta(value: unknown): SyncMeta | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const revision = raw.remoteRevision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return null

  if (typeof raw.dirty !== 'boolean') return null

  const email = typeof raw.email === 'string' && raw.email !== '' ? raw.email : null

  const syncedAt = raw.lastSyncedAt
  if (syncedAt !== null && (typeof syncedAt !== 'number' || !Number.isFinite(syncedAt))) {
    return null
  }

  return { email, remoteRevision: revision, dirty: raw.dirty, lastSyncedAt: syncedAt }
}

/** 读元信息。坏数据、读不出来都当作「没有可信记录」，不让它拖垮启动。 */
export function readSyncMeta(storage: StorageLike): SyncMeta | null {
  try {
    const raw = storage.getItem(SYNC_META_KEY)
    if (!raw) return null
    return parseSyncMeta(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeSyncMeta(storage: StorageLike, meta: SyncMeta | null): void {
  try {
    if (meta === null) storage.removeItem(SYNC_META_KEY)
    else storage.setItem(SYNC_META_KEY, JSON.stringify(meta))
  } catch {
    /* 元信息存不住只影响下次启动的判断，不影响本次同步 */
  }
}

// ---- 手动导出的时刻（只用于「是不是该提醒了」）----

export function readLastCopied(storage: StorageLike): number | null {
  try {
    const raw = storage.getItem(LAST_COPIED_KEY)
    if (!raw) return null
    const at = Number(raw)
    return Number.isFinite(at) && at > 0 ? at : null
  } catch {
    return null
  }
}

export function writeLastCopied(storage: StorageLike, at: number): void {
  try {
    storage.setItem(LAST_COPIED_KEY, String(at))
  } catch {
    /* 存不住最多是多提醒一次 */
  }
}

/**
 * 是否该提醒用户「数据还没有第二份」。
 *
 * 只在自动同步不健康时才该问这个问题（没登录、出错了、站点没配 Supabase），
 * 同步正常时不唠叨。这条判断留给调用方。
 *
 * lastCopiedAt 取「最近一次成功同步」与「最近一次手动导出」中较晚的那个。
 * 为 null 表示从未拿到副本；时钟回拨（它晚于 now）不提醒；没有记录时不提醒。
 */
export function shouldRemindBackup(
  lastCopiedAt: number | null,
  now: number,
  recordCount: number,
  staleDays: number = STALE_DAYS,
): boolean {
  if (!Number.isFinite(recordCount) || recordCount <= 0) return false
  if (lastCopiedAt === null || !Number.isFinite(lastCopiedAt)) return true
  return now - lastCopiedAt > staleDays * DAY_MS
}
