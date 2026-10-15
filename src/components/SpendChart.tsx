import { cn } from 'cn'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { formatMoney } from '@/lib/format.ts'
import { barHeights } from '@/lib/stats.ts'
import type { YearSummary } from '@/lib/types.ts'

type Props = {
  year: number
  years: number[]
  selectedMonth: number
  summary: YearSummary
  onYearChange: (year: number) => void
  onMonthSelect: (month: number) => void
}

// 12 个标签会挤成一团，只标四分之一节点；选中的那个始终显示
const ALWAYS_LABELLED = new Set([1, 4, 7, 10])

export function SpendChart({
  year,
  years,
  selectedMonth,
  summary,
  onYearChange,
  onMonthSelect,
}: Props) {
  const heights = barHeights(summary.months)

  return (
    <section className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground">每月金额</h2>
        <Select
          items={years.map((y) => ({ value: String(y), label: `${y} 年` }))}
          value={String(year)}
          onValueChange={(v) => onYearChange(Number(v))}
        >
          <SelectTrigger size="sm" aria-label="选择年份">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y} 年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 基线让「零」有落点，而不是悬空 */}
      <div className="relative flex h-[148px] items-end gap-[3px] pb-5">
        <div className="absolute inset-x-0 bottom-5 h-px bg-border" aria-hidden />

        {summary.months.map((m, i) => {
          const selected = m.month === selectedMonth
          const showLabel = selected || ALWAYS_LABELLED.has(m.month)
          return (
            <button
              key={m.month}
              type="button"
              aria-pressed={selected}
              aria-label={`${year} 年 ${m.month} 月，${formatMoney(m.total)}，${m.count} 次`}
              title={`${m.month} 月 ${formatMoney(m.total)} · ${m.count} 次`}
              onClick={() => onMonthSelect(m.month)}
              className="relative z-1 flex h-full flex-1 cursor-pointer flex-col justify-end rounded-[4px] border-0 bg-transparent p-0 transition-colors hover:bg-muted"
            >
              <div
                className={cn(
                  'rounded-t-[4px] transition-colors',
                  selected ? 'bg-(--bar-selected)' : 'bg-chart-1',
                )}
                // 零高柱子保留 2px，表达「这个月没有记录」而不是渲染失败
                style={{ height: `${heights[i] * 100}%`, minHeight: 2 }}
              />
              <span
                className={cn(
                  'absolute inset-x-0 -bottom-5 text-center text-[11px] leading-5 tabular-nums transition-opacity',
                  showLabel ? 'opacity-100' : 'opacity-0',
                  selected ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {m.month}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
