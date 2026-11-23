import { lazy, Suspense, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { cn } from 'cn'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { toISODate } from '@/lib/format.ts'

const LazyCalendar = lazy(() => import('@/components/DatePickerCalendar.tsx'))

type Props = {
  id?: string
  /** "YYYY-MM-DD"，可能为空串 */
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

/**
 * 自绘日期选择器，替代 <input type="date">。
 * 日历主体通过 React.lazy 按需加载，只有展开弹层时才拉取 react-day-picker 与 date-fns。
 */
export function DatePicker({ id, value, onChange, invalid = false }: Props) {
  const [open, setOpen] = useState(false)

  function pick(date: Date | undefined) {
    if (!date) return
    onChange(toISODate(date))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={value ? `日期 ${value}` : '选择日期'}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 border border-input bg-card px-2.5',
          'font-mono text-sm outline-none select-none sm:w-[150px]',
          'hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        )}
      >
        <span className={value ? undefined : 'text-muted-foreground'}>
          {value || '选择日期'}
        </span>
        <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      {/* 描边与去阴影由 ui/popover.tsx 的默认值提供，这里只覆盖内边距 */}
      <PopoverContent align="start" className="w-auto p-0">
        {open ? (
          <Suspense
            fallback={
              <div className="px-6 py-8 font-mono text-xs text-muted-foreground">加载日历…</div>
            }
          >
            <LazyCalendar value={value} onPick={pick} />
          </Suspense>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
