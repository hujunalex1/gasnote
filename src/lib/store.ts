import { isValidDate } from './format.ts'
import type { FuelRecord } from './types.ts'

export const STORAGE_KEY = 'gasnote.records.v1'
export const CORRUPT_KEY = 'gasnote.records.v1.corrupt'
export const SCHEMA_VERSION = 1

/** 只需要这三个方法，所以单测可以塞一个 Map 假存储进来，不必碰真 localStorage。 */
export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type DecodeStatus = 'empty' | 'ok' | 'corrupt-format' | 'corrupt-version'

export type Decoded =
  | { status: 'empty'; records: FuelRecord[] }
  | { status: 'ok'; records: FuelRecord[] }
  | { status: 'corrupt-format'; records: FuelRecord[]; raw: string }
  | { status: 'corrupt-version'; records: FuelRecord[]; raw: string }

export type NormalizeResult =
  | { ok: true; records: FuelRecord[] }
  | { ok: false; error: string }

export type Notice = {
  kind: 'storage-unavailable' | 'corrupt-version' | 'corrupt-format'
  raw?: string
}

export type LoadResult = { records: FuelRecord[]; notice: Notice | null }
export type SaveResult = { ok: true } | { ok: false; error: string }

let idSeq = 0

/**
 * id 生成的回退路径：毫秒 + 自增序号 + 随机数。
 * 自增序号是关键 —— 它保证同一毫秒内连续调用也不会撞号。
 *
 * 导出它**只是为了让测试能真的跑到这条分支**：Node 里 crypto.randomUUID 必然存在，
 * 如果把它藏在 newId 内部，测试就永远只覆盖 UUID 那条路，回退路径写错了也发现不了。
 * 业务代码请用 newId()，不要直接调这个。
 */
export function newIdFallback(): string {
  idSeq += 1
  return `r${Date.now().toString(36)}-${idSeq}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 生成记录 id。
 * crypto.randomUUID 只在 secure context 可用（http://localhost 算，局域网 IP 不算），
 * 所以必须有回退。
 */
export function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return typeof uuid === 'string' ? uuid : newIdFallback()
}

/** 单条记录的字段校验。返回错误描述，合法则返回 null。 */
function validateRecord(r: unknown): string | null {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) {
    return '不是一个对象'
  }
  const rec = r as Record<string, unknown>
  if (typeof rec.date !== 'string' || !isValidDate(rec.date)) {
    return `日期不是合法的 YYYY-MM-DD：${JSON.stringify(rec.date)}`
  }
  if (typeof rec.amount !== 'number' || !Number.isFinite(rec.amount) || rec.amount <= 0) {
    return `金额不是大于 0 的数字：${JSON.stringify(rec.amount)}`
  }
  return null
}

/**
 * 校验并规整记录数组。
 *
 * 拒绝（整体失败，绝不返回半截结果）：元素不是对象、日期非法、金额非法。
 * 修补（不拒绝）：id 缺失或重复 → 补发；note 非字符串 → 补空串；金额归整到分。
 *
 * 为什么 id 只修补不拒绝：id 是内部实现细节，用户看不见也不该关心。
 * 它坏掉不该让整份备份作废——那会让用户手里唯一的一份备份变成废纸。
 */
export function normalizeRecords(input: unknown): NormalizeResult {
  if (!Array.isArray(input)) return { ok: false, error: '`records` 不是数组' }

  const seen = new Set<string>()
  const records: FuelRecord[] = []

  for (let i = 0; i < input.length; i++) {
    const r = input[i] as Record<string, unknown> | null
    const problem = validateRecord(r)
    if (problem) return { ok: false, error: `第 ${i + 1} 条记录有问题：${problem}` }

    const rawId = r!.id
    let id = typeof rawId === 'string' && rawId !== '' ? rawId : newId()
    if (seen.has(id)) id = newId()
    seen.add(id)

    records.push({
      id,
      date: r!.date as string,
      amount: Math.round((r!.amount as number) * 100) / 100,
      note: typeof r!.note === 'string' ? r!.note : '',
    })
  }

  return { ok: true, records }
}

/** 把 JSON 文本解析成记录数组，全部校验通过才返回 ok。 */
export function parseImport(jsonString: string): NormalizeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    return { ok: false, error: '这不是一个合法的 JSON 文件' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '文件顶层应该是一个对象' }
  }
  const payload = parsed as Record<string, unknown>
  if (payload.version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `文件版本是 ${JSON.stringify(payload.version)}，本工具只认识版本 ${SCHEMA_VERSION}`,
    }
  }
  return normalizeRecords(payload.records)
}

/** 记录数组 → 存储/导出用的 JSON 文本。 */
export function serialize(records: FuelRecord[]): string {
  return JSON.stringify({ version: SCHEMA_VERSION, records }, null, 2)
}

/**
 * 把 localStorage 里的原始字符串解码成状态。
 * 纯函数——不写任何东西，方便单测。
 */
export function decodeStored(raw: string | null | undefined): Decoded {
  if (raw === null || raw === undefined || raw === '') {
    return { status: 'empty', records: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'corrupt-format', records: [], raw }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'corrupt-format', records: [], raw }
  }

  const payload = parsed as Record<string, unknown>
  if (payload.version !== SCHEMA_VERSION) {
    return { status: 'corrupt-version', records: [], raw }
  }

  const normalized = normalizeRecords(payload.records)
  if (!normalized.ok) return { status: 'corrupt-format', records: [], raw }

  return { status: 'ok', records: normalized.records }
}

/** 探测 localStorage 是否真的可写（无痕模式、隐私设置都会让它抛异常）。 */
export function probeStorage(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false
  const probeKey = '__gasnote_probe__'
  try {
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

/**
 * 启动时读取数据。
 *
 * 遇到读不懂的数据时绝不静默丢弃：把原文备份到 CORRUPT_KEY，以空数据启动，
 * 并把情况作为 notice 交给 UI 去显示横幅。宁可让用户看到空列表并被告知，
 * 也不能让数据无声消失。
 */
export function load(storage: StorageLike | null | undefined): LoadResult {
  if (!storage) {
    return { records: [], notice: { kind: 'storage-unavailable' } }
  }

  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { records: [], notice: { kind: 'storage-unavailable' } }
  }

  const decoded = decodeStored(raw)
  if (decoded.status === 'ok') return { records: decoded.records, notice: null }
  if (decoded.status === 'empty') return { records: [], notice: null }

  // 损坏：先备份原文。备份失败也要继续，不能因此把数据弄丢。
  try {
    storage.setItem(CORRUPT_KEY, decoded.raw)
  } catch {
    /* 忽略：备份失败不影响后续流程 */
  }

  return { records: [], notice: { kind: decoded.status, raw: decoded.raw } }
}

/** 写入数据。失败时返回可读的错误，绝不静默吞掉。 */
export function save(storage: StorageLike | null | undefined, records: FuelRecord[]): SaveResult {
  if (!storage) {
    return {
      ok: false,
      error: '浏览器不允许保存数据，本次记录只在当前页面有效。请点右上角「备份」→「导出」。',
    }
  }
  try {
    storage.setItem(STORAGE_KEY, serialize(records))
    return { ok: true }
  } catch {
    return {
      ok: false,
      error:
        '保存失败（可能是浏览器隐私模式或存储空间已满）。本次记录只在当前页面有效，请立刻点右上角「备份」→「导出」。',
    }
  }
}
