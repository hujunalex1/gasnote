/** 一条加油记录。date 是本地日期的 "YYYY-MM-DD" 文本，不是 Date 对象。 */
export type FuelRecord = {
  id: string
  /** "YYYY-MM-DD"，本地日期 */
  date: string
  /** 单位：元，最多两位小数 */
  amount: number
  note: string
  /** 仪表盘总里程，单位 km，整数。选填：旧记录和只记账的记录没有它 */
  odometer?: number
  /** 本次加了多少升，最多两位小数。选填 */
  liters?: number
  /** 这次是否加满。只在有 liters 时有意义；缺省按加满算 */
  full?: boolean
}

/** 两次加满之间的一段。由 economySegments 算出，不落库。 */
export type EconomySegment = {
  /** 结束这一段的那次加满的记录 id */
  endId: string
  endDate: string
  /** km */
  distance: number
  /** 这一段烧掉的升数（不含起点那次加满的量） */
  liters: number
  /** 这一段的花费，元（同样不含起点那次） */
  cost: number
}

/** 一段时间的平均油耗。没有完整区间时 per100km 为 null，不是 0 也不是 NaN。 */
export type EconomySummary = {
  distance: number
  liters: number
  cost: number
  /** L/100km */
  per100km: number | null
  /** 元/km */
  costPerKm: number | null
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
