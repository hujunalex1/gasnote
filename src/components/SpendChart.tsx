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

      {/* 基线让「零」有落点，而不是悬空。
          高度 168 = 20(pt-5 的金额标签带) + 128(柱区) + 20(pb-5 的月份标签带)。
          柱区必须严格保持 128px，和加标签之前一模一样：柱高是相对柱区的百分比，
          柱区一旦被标签挤掉一截，最高的两根柱子就会看起来一样高——那是失真，
          不是"稍微矮一点"。所以宁可把卡片加高 20px。 */}
      <div className="relative flex h-[168px] items-end gap-[3px] pt-5 pb-5">
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
              {/* 只有选中的那根柱子标金额。bottom 用的是和柱高同一个百分比，
                  所以它永远紧贴柱顶，与柱子多高无关。
                  left-1/2 + -translate-x-1/2 + whitespace-nowrap：¥1,240.50 比
                  列宽（桌面端约 46px）还宽，用 inset-x-0 会被压成半个字，
                  这样写让标签按文字宽度撑开、以列为中轴居中。
                  bg-card 底衬不是装饰：选中矮柱时标签会压到相邻的高柱上
                  （9 月矮柱紧邻 10 月高柱就是这个情况），没有底衬就成了深琥珀
                  底上的黑字，读不清。
                  max(…, 2px) 是为了跟上柱子那边的 minHeight: 2px —— 零值月份的
                  柱高是 0%，却被撑到 2px，标签如果只按 0% 算就会贴到柱子上
                  （实测间隙 1px 而不是 3px）。下限写在这里，两边才对得上。 */}
              {selected ? (
                <span
                  className="absolute left-1/2 -translate-x-1/2 bg-card px-1 font-mono text-[11px] leading-4 font-semibold whitespace-nowrap text-foreground"
                  style={{ bottom: `calc(max(${heights[i] * 100}%, 2px) + 3px)` }}
                >
                  {formatMoney(m.total)}
                </span>
              ) : null}
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
