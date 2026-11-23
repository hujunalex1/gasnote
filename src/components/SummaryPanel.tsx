import { formatMoney } from '@/lib/format.ts'
import type { SummaryCards } from '@/lib/types.ts'

const LABEL = 'm-0 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground'

/**
 * 本月是主数字、本年降为次级。
 * 这个工具每次打开真正要看的是「这个月花了多少」，两个数字等权会让它失去焦点。
 */
export function SummaryPanel({ cards, year }: { cards: SummaryCards; year: number }) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1.4fr_1fr] sm:gap-3">
      <div className="flex min-w-0 flex-col justify-center border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
        <h2 className={LABEL}>本月</h2>
        <p className="mt-2 mb-0 font-mono text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:mt-2.5 sm:text-[40px]">
          {formatMoney(cards.month.total)}
        </p>
        <p className="mt-2 mb-0 font-mono text-[12px] leading-snug text-muted-foreground tabular-nums sm:mt-2.5">
          {cards.month.count} 次 · 均 {formatMoney(cards.month.avg)}
        </p>
      </div>

      <div className="flex min-w-0 flex-col justify-center border border-border bg-muted/40 px-3.5 py-3 sm:px-4 sm:py-3.5">
        {/* 看的是往年时标题还写「本年」会让人误读成今年 */}
        <h2 className={LABEL}>{cards.isCurrentYear ? '本年' : `${year} 年`}</h2>
        <p className="mt-2 mb-0 font-mono text-[20px] leading-none font-semibold tracking-[-0.02em] text-foreground/90 tabular-nums sm:mt-2.5 sm:text-2xl">
          {formatMoney(cards.year.total)}
        </p>
        <p className="mt-2 mb-0 font-mono text-[12px] leading-snug text-muted-foreground tabular-nums sm:mt-2.5">
          {cards.year.count} 次 · 均 {formatMoney(cards.year.avg)}
        </p>
      </div>
    </section>
  )
}
