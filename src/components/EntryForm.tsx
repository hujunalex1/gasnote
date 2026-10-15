import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { DatePicker } from '@/components/DatePicker.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { isValidDate, parseAmountInput, todayISO } from '@/lib/format.ts'
import { newId } from '@/lib/store.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Props = { onAdd: (record: FuelRecord) => void }

export function EntryForm({ onAdd }: Props) {
  const [date, setDate] = useState(todayISO)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!date) {
      setError('请选择日期')
      return
    }
    // <input type="date"> 正常只会给出合法值，这里是兜底：
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

    onAdd({ id: newId(), date, amount: parsed.amount, note: note.trim() })

    // 日期重置为今天而不是保留上次的值，避免用户忘了改日期而把账记进错误的月份
    setDate(todayISO())
    setAmount('')
    setNote('')
    amountRef.current?.focus()
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-none border border-border bg-muted/50 px-4 py-3.5"
    >
      <h2 className="mb-3 font-mono text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
        记一笔
      </h2>

      <div className="flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <Label htmlFor="entry-date" className="font-mono text-[11px] text-muted-foreground">
            日期
          </Label>
          <DatePicker id="entry-date" value={date} onChange={setDate} />
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <Label htmlFor="entry-amount" className="font-mono text-[11px] text-muted-foreground">
            金额
          </Label>
          <Input
            id="entry-amount"
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="320.50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 bg-card font-mono text-xl font-semibold sm:w-[160px]"
            aria-invalid={error !== ''}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="entry-note" className="font-mono text-[11px] text-muted-foreground">
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

      <div className="mt-3.5 flex items-center justify-between gap-3">
        <p role="alert" className="m-0 text-[13.5px] text-destructive">
          {error}
        </p>
        <Button type="submit" className="h-9 rounded-none px-6 font-mono font-semibold">
          记下
        </Button>
      </div>
    </form>
  )
}
