import { formatMoney } from '@/lib/format.ts'
import type { SummaryCards } from '@/lib/types.ts'

/**
 * 本月是主数字、本年降为次级。
 * 这个工具每次打开真正要看的是「这个月花了多少」，两个数字等权会让它失去焦点。
 */
export function SummaryPanel({ cards, year }: { cards: SummaryCards; year: number }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col justify-center rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
        <h2 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground">本月</h2>
        <p className="mt-1.5 mb-0 text-4xl font-semibold tracking-[-0.025em] tabular-nums leading-tight">
          {formatMoney(cards.month.total)}
        </p>
        <p className="mt-1.5 mb-0 text-[13px] text-muted-foreground tabular-nums">
          {cards.month.count} 次 · 均 {formatMoney(cards.month.avg)}
        </p>
      </div>

      <div className="flex flex-col justify-center rounded-xl bg-muted/40 px-5 py-4 ring-1 ring-foreground/10">
        {/* 看的是往年时标题还写「本年」会让人误读成今年 */}
        <h2 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground">
          {cards.isCurrentYear ? '本年' : `${year} 年`}
        </h2>
        <p className="mt-1.5 mb-0 text-2xl font-semibold tracking-[-0.015em] tabular-nums leading-tight text-foreground/90">
          {formatMoney(cards.year.total)}
        </p>
        <p className="mt-1.5 mb-0 text-[13px] text-muted-foreground tabular-nums">
          {cards.year.count} 次 · 均 {formatMoney(cards.year.avg)}
        </p>
      </div>
    </section>
  )
}
