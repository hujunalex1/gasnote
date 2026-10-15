// 纯统计函数：只吃数组、只吐数字和对象。
// 不碰 DOM、不碰 localStorage、不读系统时间——因此可以完整单测。
import type { FuelRecord, MonthBucket, SummaryCards, Totals, YearSummary } from './types.ts'

/** "2026-10-15" → "2026-10"。纯字符串截取，天然没有时区问题。 */
export function monthKey(dateStr: string): string {
  return String(dateStr).slice(0, 7)
}

// 金额一律转成整数「分」再累加，避免浮点误差在几十条记录后漂出来。
const toCents = (amount: number): number => Math.round(Number(amount) * 100)
const fromCents = (cents: number): number => cents / 100

/** 某个月（"2026-10"）的合计、次数、平均每次。无记录时全部为 0，绝不是 NaN。 */
export function monthlyTotal(records: FuelRecord[], ym: string): Totals {
  let cents = 0
  let count = 0
  for (const r of records) {
    if (monthKey(r.date) === ym) {
      cents += toCents(r.amount)
      count += 1
    }
  }
  const avg = count === 0 ? 0 : fromCents(Math.round(cents / count))
  return { total: fromCents(cents), count, avg }
}

/**
 * 某一年的汇总。months 恒定返回 12 项，没记录的月份是 { total: 0, count: 0 }，
 * 这样柱状图永远画得出 12 根柱子。
 */
export function yearlySummary(records: FuelRecord[], year: number): YearSummary {
  const prefix = `${year}-`
  const buckets = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, cents: 0, count: 0 }))

  for (const r of records) {
    const key = monthKey(r.date)
    if (!key.startsWith(prefix)) continue
    const index = Number(key.slice(5, 7)) - 1
    if (!Number.isInteger(index) || index < 0 || index > 11) continue
    buckets[index].cents += toCents(r.amount)
    buckets[index].count += 1
  }

  let totalCents = 0
  let count = 0
  const months: MonthBucket[] = buckets.map((b) => {
    totalCents += b.cents
    count += b.count
    return { month: b.month, total: fromCents(b.cents), count: b.count }
  })

  return { total: fromCents(totalCents), count, months }
}

/**
 * 年份选择器的选项，降序。
 * currentYear 作为参数传入而不是在这里读系统时间——保持本文件是纯函数。
 * 当前年份始终包含在内，否则用户在没有任何记录的年份里没法记账。
 */
export function allYears(records: FuelRecord[], currentYear: number): number[] {
  const years = new Set<number>([currentYear])
  for (const r of records) {
    const y = Number(monthKey(r.date).slice(0, 4))
    if (Number.isInteger(y)) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

/** 每月合计 → 0..1 的柱高比例。全零时返回全零，不做除以 0。 */
export function barHeights(months: MonthBucket[]): number[] {
  const max = months.reduce((acc, m) => Math.max(acc, m.total), 0)
  if (max <= 0) return months.map(() => 0)
  return months.map((m) => m.total / max)
}

/**
 * 概览卡要显示的两个数字。
 *
 * 本月卡恒定看「真实的当前月」；本年卡**跟随年份选择器**。
 * 这一点是 spec §7 明确定的：「年份选择器切换 → 概览卡「本年」跟随更新」。
 * 若本年卡不跟随，用户切到某个年份做同比时，看到的会是另一个年份的总额
 * ——而同比正是这个选择器存在的全部理由。
 *
 * now 作为参数传入，保持本文件是纯函数。
 */
export function summaryCards(
  records: FuelRecord[],
  selectedYear: number,
  now: Date,
): SummaryCards {
  const realMonth = monthlyTotal(
    records,
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  )

  const summary = yearlySummary(records, selectedYear)
  // 平均金额同样走整数「分」，与项目其余部分口径一致
  const avg =
    summary.count === 0 ? 0 : fromCents(Math.round(toCents(summary.total) / summary.count))

  return {
    month: realMonth,
    year: { total: summary.total, count: summary.count, avg },
    isCurrentYear: selectedYear === now.getFullYear(),
  }
}
