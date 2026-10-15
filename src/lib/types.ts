/** 一条加油记录。date 是本地日期的 "YYYY-MM-DD" 文本，不是 Date 对象。 */
export type FuelRecord = {
  id: string
  /** "YYYY-MM-DD"，本地日期 */
  date: string
  /** 单位：元，最多两位小数 */
  amount: number
  note: string
}

/** 一段时间的汇总。无记录时三项全为 0，绝不是 NaN。 */
export type Totals = { total: number; count: number; avg: number }

/** 某一个月在年度汇总里的一项。 */
export type MonthBucket = { month: number; total: number; count: number }

export type YearSummary = { total: number; count: number; months: MonthBucket[] }

/** 概览卡要显示的两个数字。 */
export type SummaryCards = {
  month: Totals
  year: Totals
  /** 所选年份是否就是当前年份（决定卡片标题写「本年」还是具体年份） */
  isCurrentYear: boolean
}

/** 存储/导出用的顶层结构。 */
export type StoredPayload = { version: number; records: FuelRecord[] }
