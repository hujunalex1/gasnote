import { formatKm, formatLiters, formatMoney, formatPer100km } from '@/lib/format.ts'
import { segmentPer100km } from '@/lib/stats.ts'
import type { EconomySegment, EconomySummary } from '@/lib/types.ts'

const LABEL = 'm-0 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground'
const UNIT = 'ml-1 text-xs font-normal text-muted-foreground'

type Props = {
  /** 最近一段，不跟随年份选择器——和「本月」一样，打开就想看的是现在的车况 */
  latest: EconomySegment | null
  /** 所选年份的平均，跟随年份选择器 */
  yearSummary: EconomySummary
  year: number
  isCurrentYear: boolean
}

export function EconomyPanel({ latest, yearSummary, year, isCurrentYear }: Props) {
  if (latest === null) {
    return (
      <section className="border border-border bg-card px-4 py-3.5">
        <h2 className={LABEL}>油耗</h2>
        <p className="mt-2 mb-0 text-[13px] text-muted-foreground">
          连续两次加满、都填了总里程和升数之后，这里会显示油耗。中间没加满的那几次也要填升数。
        </p>
      </section>
    )
  }

  const latestPer100km = segmentPer100km(latest)

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col justify-center border border-border bg-card px-4 py-3.5">
        <h2 className={LABEL}>最近油耗</h2>
        <p className="mt-2.5 mb-0 font-mono text-[28px] leading-none font-semibold tracking-[-0.02em]">
          {formatPer100km(latestPer100km)}
          <span className={UNIT}>L/100km</span>
        </p>
        <p className="mt-2.5 mb-0 font-mono text-[12px] text-muted-foreground">
          {formatKm(latest.distance)} · {formatLiters(latest.liters)} · 截至 {latest.endDate.slice(5)}
        </p>
      </div>

      <div className="flex flex-col justify-center border border-border bg-muted/40 px-4 py-3.5">
        <h2 className={LABEL}>{isCurrentYear ? '本年' : `${year} 年`}平均</h2>
        {yearSummary.per100km === null || yearSummary.costPerKm === null ? (
          <p className="mt-2.5 mb-0 font-mono text-[13px] text-muted-foreground">这一年还没有完整区间</p>
        ) : (
          <>
            <p className="mt-2.5 mb-0 font-mono text-2xl leading-none font-semibold tracking-[-0.02em] text-foreground/90">
              {formatPer100km(yearSummary.per100km)}
              <span className={UNIT}>L/100km</span>
            </p>
            <p className="mt-2.5 mb-0 font-mono text-[12px] text-muted-foreground">
              {formatKm(yearSummary.distance)} · 每公里 {formatMoney(yearSummary.costPerKm)}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
