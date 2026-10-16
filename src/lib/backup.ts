// 自动备份的纯逻辑层：只处理文件名与判定，不碰任何浏览器 API。
// 真正的写盘在 fileBackup.ts（薄适配层），所以这里的规则可以完整单测。
//
// 本文件里的 pickPrunable 是全项目唯一会删用户文件的地方，
// 因此它的安全属性（只删严格匹配的备份文件）必须由测试钉死。
import { isValidDate } from './format.ts'

export const BACKUP_PREFIX = 'gasnote-'
export const BACKUP_SUFFIX = '.json'

/** 目录里保留多少份按天快照。旧于这个数量的会被删掉。 */
export const BACKUP_KEEP = 14

/** 多久没拿到一份数据副本就提醒（天）。 */
export const STALE_DAYS = 14

export const DAY_MS = 24 * 60 * 60 * 1000

const BACKUP_RE = /^gasnote-(\d{4})-(\d{2})-(\d{2})\.json$/

/** "2026-10-16" → "gasnote-2026-10-16.json"。调用方负责传入合法的日期。 */
export function backupFileName(dateStr: string): string {
  return `${BACKUP_PREFIX}${dateStr}${BACKUP_SUFFIX}`
}

/**
 * 备份文件名 → 其中的日期；不是备份文件则返回 null。
 *
 * 刻意严格：不仅要求格式，还要求那个日期在日历上真实存在。
 * 宽松的匹配意味着宽松的删除，而删除是不可撤销的。
 */
export function backupDateOf(name: unknown): string | null {
  const m = BACKUP_RE.exec(String(name ?? ''))
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  return isValidDate(date) ? date : null
}

/** 这个文件名是不是本工具产出的备份。 */
export function isBackupName(name: unknown): boolean {
  return backupDateOf(name) !== null
}

/**
 * 从目录现有文件名里挑出该删的：保留最新的 keep 份，返回更早的那些。
 *
 * 返回顺序是契约的一部分：按日期升序（最旧的在前），与输入顺序无关。
 *
 * 两条安全边界：
 * 1. 只认 isBackupName 通过的名字。用户选的可能是一个装满东西的目录
 *    （照片、文稿、`.DS_Store`），非备份文件一律不在返回值里。
 * 2. keep 退化（0、负数、NaN）时兜底为 1，绝不返回全部——删光是不可逆的。
 */
export function pickPrunable(names: string[], keep: number = BACKUP_KEEP): string[] {
  const n = Math.floor(Number(keep))
  const limit = Number.isFinite(n) && n >= 1 ? n : 1
  // 前缀后缀一致，所以按整个文件名排序等价于按日期排序
  const newestFirst = names.filter(isBackupName).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return newestFirst.slice(limit).reverse()
}

/**
 * 是否该提醒用户手动弄一份数据出去。
 *
 * 只在自动备份不可用（浏览器不支持）或未开启时才该问这个问题——
 * 自动备份正常工作时不该再唠叨。这个判断留给调用方。
 *
 * lastCopiedAt 为 null 表示从未备份过；时钟回拨（它晚于 now）不提醒。
 */
export function shouldRemindExport(
  lastCopiedAt: number | null | undefined,
  now: number,
  recordCount: number,
  staleDays: number = STALE_DAYS,
): boolean {
  if (!Number.isFinite(recordCount) || recordCount <= 0) return false
  if (lastCopiedAt === null || lastCopiedAt === undefined || !Number.isFinite(lastCopiedAt)) {
    return true
  }
  return now - lastCopiedAt > staleDays * DAY_MS
}
