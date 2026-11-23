import { zhCN } from 'date-fns/locale'
import { Button } from '@/components/ui/button.tsx'
import { Calendar } from '@/components/ui/calendar.tsx'
import { fromISODate } from '@/lib/format.ts'

type Props = {
  value: string
  onPick: (date: Date | undefined) => void
}

/**
 * 单独拆成懒加载 chunk：绝大多数记账直接用默认「今天」，
 * 不点开日期选择器时无需在首屏下载 react-day-picker 与 date-fns。
 */
export default function DatePickerCalendar({ value, onPick }: Props) {
  return (
    <>
      <Calendar
        mode="single"
        required
        selected={fromISODate(value)}
        onSelect={onPick}
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
          onClick={() => onPick(new Date())}
        >
          今天
        </Button>
      </div>
    </>
  )
}
