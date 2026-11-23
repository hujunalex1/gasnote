import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { DatePicker } from '@/components/DatePicker.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import {
  formatKm,
  isValidDate,
  parseAmountInput,
  parseLitersInput,
  parseOdometerInput,
  todayISO,
} from '@/lib/format.ts'
import { odometerBounds } from '@/lib/stats.ts'
import { newId } from '@/lib/store.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Props = {
  /** 全部已有记录，只用来校验总里程是否前后矛盾 */
  records: FuelRecord[]
  onAdd: (record: FuelRecord) => void
}

export function EntryForm({ records, onAdd }: Props) {
  const [date, setDate] = useState(todayISO)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [odometer, setOdometer] = useState('')
  const [liters, setLiters] = useState('')
  const [full, setFull] = useState(true)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
  /** 用户没手动改过日期时，标签页跨天切回前台会自动同步为今天 */
  const dateTouchedRef = useRef(false)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || dateTouchedRef.current) return
      const today = todayISO()
      setDate((current) => (current === today ? current : today))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // 找当前所选日期及之前的最大里程，作为输入提示，防手滑多打一位
  let lastOdometer: number | null = null
  for (const r of records) {
    if (r.odometer !== undefined && r.date <= date) {
      lastOdometer = lastOdometer === null ? r.odometer : Math.max(lastOdometer, r.odometer)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!date) {
      setError('请选择日期')
      return
    }
    // DatePicker 正常只会给出合法值，这里是兜底：
    // 非法日期一旦落库，会污染整条按月份分组的统计链。
    if (!isValidDate(date)) {
      setError('日期格式不对，应为 YYYY-MM-DD')
      return
    }

    const parsed = parseAmountInput(amount)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    const parsedOdometer = parseOdometerInput(odometer)
    if (!parsedOdometer.ok) {
      setError(parsedOdometer.error)
      return
    }
    const parsedLiters = parseLitersInput(liters)
    if (!parsedLiters.ok) {
      setError(parsedLiters.error)
      return
    }

    // 总里程只增不减。填错一位数会让前后两段油耗同时离谱，所以在这里就拦下
    if (parsedOdometer.value !== undefined) {
      const { min, max } = odometerBounds(records, date)
      if (min !== null && parsedOdometer.value <= min) {
        setError(`总里程应大于之前记录的 ${formatKm(min)}`)
        return
      }
      if (max !== null && parsedOdometer.value >= max) {
        setError(`总里程应小于之后记录的 ${formatKm(max)}`)
        return
      }
    }

    const record: FuelRecord = { id: newId(), date, amount: parsed.amount, note: note.trim() }
    if (parsedOdometer.value !== undefined) record.odometer = parsedOdometer.value
    if (parsedLiters.value !== undefined) {
      record.liters = parsedLiters.value
      // 「是否加满」只有在知道加了多少升时才有意义
      record.full = full
    }
    onAdd(record)

    // 日期重置为今天而不是保留上次的值，避免用户忘了改日期而把账记进错误的月份
    dateTouchedRef.current = false
    setDate(todayISO())
    setAmount('')
    setNote('')
    setOdometer('')
    setLiters('')
    // 不加满是例外，记完一笔就回到默认，免得下一次忘了勾回来
    setFull(true)
    // 桌面端自动聚焦方便连续补录；手机触屏收起软键盘，避免遮住刚更新的统计和明细
    if (globalThis.matchMedia?.('(pointer: coarse)').matches) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    } else {
      amountRef.current?.focus()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-none border border-border bg-muted/50 px-4 py-3.5"
    >
      <h2 className="mb-3 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground">
        记一笔
      </h2>

      {/* 手机端两列紧凑排布（日期+金额 / 总里程+升数 / 备注），减少竖向占屏，
          让首屏能同时看见本月统计；桌面端展开为两行标准仪表盘排布。 */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 sm:flex sm:flex-row sm:items-end sm:gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-auto sm:shrink-0">
          <Label htmlFor="entry-date" className="font-mono text-xs text-muted-foreground">
            日期
          </Label>
          <DatePicker
            id="entry-date"
            value={date}
            onChange={(next) => {
              dateTouchedRef.current = true
              setDate(next)
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 sm:w-[160px] sm:shrink-0">
          <Label htmlFor="entry-amount" className="font-mono text-xs text-muted-foreground">
            金额
          </Label>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-sm text-muted-foreground/70 select-none"
            >
              ¥
            </span>
            <Input
              id="entry-amount"
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 bg-card pl-7 font-mono text-xl font-semibold tabular-nums"
              aria-invalid={error !== ''}
            />
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:flex-1">
          <Label htmlFor="entry-note" className="font-mono text-xs text-muted-foreground">
            备注
          </Label>
          <Input
            id="entry-note"
            maxLength={40}
            autoComplete="off"
            placeholder="可选"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-10 bg-card"
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3 sm:mt-3.5 sm:flex sm:flex-row sm:items-end sm:gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-[140px] sm:shrink-0">
          <Label htmlFor="entry-odometer" className="font-mono text-xs text-muted-foreground">
            总里程 km
          </Label>
          <Input
            id="entry-odometer"
            inputMode="numeric"
            autoComplete="off"
            placeholder={
              lastOdometer !== null
                ? `上次 ${lastOdometer.toLocaleString('en-US')}`
                : '选填'
            }
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="h-10 bg-card font-mono tabular-nums"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 sm:w-[120px] sm:shrink-0">
          <Label htmlFor="entry-liters" className="font-mono text-xs text-muted-foreground">
            升数 L
          </Label>
          <Input
            id="entry-liters"
            inputMode="decimal"
            autoComplete="off"
            placeholder="选填"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className="h-10 bg-card font-mono tabular-nums"
          />
        </div>

        <div className="col-span-2 flex items-center justify-between gap-3 sm:flex-1">
          <label className="flex h-10 cursor-pointer items-center gap-2 font-mono text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={full}
              onChange={(e) => setFull(e.target.checked)}
              className="size-4 accent-primary"
            />
            加满
          </label>
          <Button type="submit" className="h-9 rounded-none px-6 font-mono font-semibold">
            记下
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2.5 mb-0 text-[13.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
