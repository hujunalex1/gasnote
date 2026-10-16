import { useState } from 'react'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button.tsx'
import { Calendar } from '@/components/ui/calendar.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { fromISODate, toISODate } from '@/lib/format.ts'

type Props = {
  id?: string
  /** "YYYY-MM-DD"，可能为空串 */
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

/**
 * 自绘日期选择器，替代 <input type="date">。
 *
 * 为什么要自己画：原生那个日历弹窗是浏览器渲染的封闭控件，页面 CSS 够不着它，
 * 里面那个亮蓝色选中态和本项目的琥珀配色是硬冲突，改不掉只能换掉。
 * 换成 shadcn 的 Calendar 后，选中态走它自己的 data-[selected-single]:bg-primary，
 * 自动就是我们的琥珀色；格子圆角也走 --radius，和工业风的方角一致。
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

      {/* 描边与去阴影现在由 ui/popover.tsx 的默认值提供，这里只需覆盖内边距：
          日历和「今天」按钮要自己撑满弹层，默认的 p-2.5 会在四周留一圈。 */}
      <PopoverContent
        align="start"
        className="w-auto p-0"
      >
        <Calendar
          mode="single"
          required
          selected={fromISODate(value)}
          onSelect={pick}
          locale={zhCN}
          // 与系统原生日历一致：周日排第一列
          weekStartsOn={0}
          autoFocus
        />
        <div className="border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full font-mono text-xs"
            onClick={() => pick(new Date())}
          >
            今天
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
