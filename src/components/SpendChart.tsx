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
    <section className="border border-border bg-card px-4 py-3.5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 font-mono text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
          每月金额
        </h2>
        <Select
          items={years.map((y) => ({ value: String(y), label: `${y} 年` }))}
          value={String(year)}
          onValueChange={(v) => onYearChange(Number(v))}
        >
          <SelectTrigger size="sm" aria-label="选择年份" className="font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)} className="font-mono">
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
              // 整列刻意不做任何填充。这里曾经是 hover:bg-muted，太重，改成 5% 墨色后
              // 仍在：热区为了"点空白也能选月"占满整列高，而柱子贴底，于是柱子有多矮、
              // 头上那块灰就有多大（9 月这种矮柱最明显）——同一个脏印子换了个位置而已。
              // 反馈已经有两重，够用：柱子压深（group-hover:bg-(--bar-hover)）
              // + 月份标签点亮（零高柱的标签还会从隐藏变显示）。
              className="group relative z-1 flex h-full flex-1 cursor-pointer flex-col justify-end rounded-none border-0 bg-transparent p-0"
            >
              <div
                // 刻意不加 transition-colors：切换深浅色时逐色淡入会让柱子慢一拍
                // （实测变量 200ms 内就变了，柱子要 1s 才跟上），而且主题切换本该是瞬时的。
                // 仪表上的指示器是跳变，不是渐隐。
                // 柱子本身也给一点悬停反馈，否则很短或零高的柱子悬停时几乎看不出来
                className={cn(
                  'rounded-none transition-colors',
                  selected
                    ? 'bg-(--bar-selected)'
                    : 'bg-chart-1 group-hover:bg-(--bar-hover)',
                )}
                // 零高柱子保留 2px，表达「这个月没有记录」而不是渲染失败
                style={{ height: `${heights[i] * 100}%`, minHeight: 2 }}
              />
              <span
                // 悬停时把月份点亮：短柱/零高柱也能看出反馈，顺带提示正指着哪个月
                className={cn(
                  'absolute inset-x-0 -bottom-5 text-center font-mono text-[11px] leading-5 transition-opacity group-hover:opacity-100',
                  showLabel ? 'opacity-100' : 'opacity-0',
                  selected
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground',
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
