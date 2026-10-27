// 文本层：用户输入的文本 ↔ 数字 ↔ 显示文本。
// 这一层存在的意义是把"人会打错字"这件事挡在业务逻辑之外。

export type AmountParseResult =
  | { ok: true; amount: number }
  | { ok: false; error: string }

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/

/**
 * 把输入框里的文本解析成金额（元）。
 * 只接受裸数字，最多两位小数。千分位、货币符号、全角数字一律拒绝，
 * 而不是"尽力猜"——静默地把 1,240.50 解析成 1 比报错危险得多。
 */
export function parseAmountInput(raw: unknown): AmountParseResult {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: false, error: '请填写金额' }
  if (!AMOUNT_RE.test(text)) {
    return { ok: false, error: '金额只能是最多两位小数的数字，例如 320.50' }
  }
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: '金额必须大于 0' }
  }
  return { ok: true, amount }
}

export type OptionalParseResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: string }

const ODOMETER_RE = /^\d+$/

/**
 * 总里程输入框 → km 整数。选填：空串得到 undefined。
 * 与金额同理，千分位、单位、小数一律拒绝——仪表盘上的总里程本来就是整数。
 */
export function parseOdometerInput(raw: unknown): OptionalParseResult {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: true, value: undefined }
  if (!ODOMETER_RE.test(text)) {
    return { ok: false, error: '总里程只能是整数公里，例如 12345' }
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, error: '总里程必须大于 0' }
  }
  return { ok: true, value }
}

/** 升数输入框 → 升。选填：空串得到 undefined。规则与金额相同：最多两位小数。 */
export function parseLitersInput(raw: unknown): OptionalParseResult {
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: true, value: undefined }
  if (!AMOUNT_RE.test(text)) {
    return { ok: false, error: '升数只能是最多两位小数的数字，例如 45.20' }
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: '升数必须大于 0' }
  }
  return { ok: true, value }
}

/** 12345 → "12,345 km" */
export function formatKm(km: number): string {
  return `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`
}

/** 45.2 → "45.20 L" */
export function formatLiters(liters: number): string {
  return `${(Math.round(liters * 100) / 100).toFixed(2)} L`
}

/** 7.834 → "7.8"。L/100km 保留一位小数已经足够，再多就是噪声。 */
export function formatPer100km(value: number): string {
  return value.toFixed(1)
}

/**
 * 金额 → 显示文本，带 ¥ 前缀与千分位，固定两位小数。
 * 全程走整数"分"，避免浮点误差漏到界面上。
 */
export function formatMoney(amount: number): string {
  const cents = Math.round(Number(amount) * 100)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}¥${grouped}.${frac}`
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Date 对象 → "YYYY-MM-DD"。
 * 一律读本地年月日分量，绝不碰 toISOString()——那是 UTC，
 * 会让晚上 23:50 记的账跑到第二天去。
 */
export function toISODate(dateObj: Date): string {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 本地时区的今天。这是全项目唯一一处读系统时间的地方。 */
export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * 校验 "YYYY-MM-DD"，并且确认这个日期在日历上真实存在
 * （2 月 30 日、4 月 31 日一律拒绝，闰年 2 月 29 日接受）。
 */
export function isValidDate(value: unknown): boolean {
  const m = DATE_RE.exec(String(value ?? ''))
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  // new Date(y, m, 0) 得到第 m 个月的最后一天（m 是 1-based）
  const daysInMonth = new Date(year, month, 0).getDate()
  return day <= daysInMonth
}

/**
 * "YYYY-MM-DD" → 当地日期的零点。
 *
 * 不要用 new Date("2026-10-15")：那个字符串按 UTC 解析，
 * 在负时区（美洲）会回退成 10 月 14 日，日历上就选错一天。
 * 日期非法时返回 undefined，绝不返回 Invalid Date——那会让日历年月显示成 NaN。
 */
export function fromISODate(value: unknown): Date | undefined {
  if (!isValidDate(value)) return undefined
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}
