import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from '@base-ui/react/dialog'
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
} from '@/lib/format.ts'
import { odometerBounds } from '@/lib/stats.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Props = {
  record: FuelRecord | null
  records: FuelRecord[]
  onSave: (updated: FuelRecord) => void
  onClose: () => void
}

/**
 * 编辑已有记录的弹窗。保留原记录 id，因此直接兼容云端 upsert 同步。
 */
export function EditRecordDialog({ record, records, onSave, onClose }: Props) {
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [odometer, setOdometer] = useState('')
  const [liters, setLiters] = useState('')
  const [full, setFull] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!record) return
    setDate(record.date)
    setAmount(String(record.amount))
    setNote(record.note)
    setOdometer(record.odometer !== undefined ? String(record.odometer) : '')
    setLiters(record.liters !== undefined ? String(record.liters) : '')
    setFull(record.full ?? true)
    setError('')
  }, [record])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!record) return
    setError('')

    if (!date || !isValidDate(date)) {
      setError('日期格式不对，应为 YYYY-MM-DD')
      return
    }

    const parsedAmount = parseAmountInput(amount)
    if (!parsedAmount.ok) {
      setError(parsedAmount.error)
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

    if (parsedOdometer.value !== undefined) {
      const { min, max } = odometerBounds(records, date, record.id)
      if (min !== null && parsedOdometer.value <= min) {
        setError(`总里程应大于之前记录的 ${formatKm(min)}`)
        return
      }
      if (max !== null && parsedOdometer.value >= max) {
        setError(`总里程应小于之后记录的 ${formatKm(max)}`)
        return
      }
    }

    const updated: FuelRecord = {
      id: record.id,
      date,
      amount: parsedAmount.amount,
      note: note.trim(),
    }
    if (parsedOdometer.value !== undefined) updated.odometer = parsedOdometer.value
    if (parsedLiters.value !== undefined) {
      updated.liters = parsedLiters.value
      updated.full = full
    }

    onSave(updated)
    onClose()
  }

  return (
    <Dialog.Root
      open={record !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-slot="dialog-backdrop"
          className="fixed inset-0 z-50 bg-black/50"
        />
        <Dialog.Popup
          data-slot="dialog-popup"
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-5 text-card-foreground outline-none"
        >
          {record ? (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
              <Dialog.Title className="m-0 font-mono text-sm font-semibold tracking-[0.02em]">
                编辑记录
              </Dialog.Title>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-date" className="font-mono text-xs text-muted-foreground">
                    日期
                  </Label>
                  <DatePicker id="edit-date" value={date} onChange={setDate} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-amount" className="font-mono text-xs text-muted-foreground">
                    金额
                  </Label>
                  <Input
                    id="edit-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-10 bg-background font-mono text-base font-semibold"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-note" className="font-mono text-xs text-muted-foreground">
                  备注
                </Label>
                <Input
                  id="edit-note"
                  maxLength={40}
                  autoComplete="off"
                  placeholder="可选"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-10 bg-background"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="edit-odometer"
                    className="font-mono text-xs text-muted-foreground"
                  >
                    总里程 km
                  </Label>
                  <Input
                    id="edit-odometer"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="选填"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="h-10 bg-background font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-liters" className="font-mono text-xs text-muted-foreground">
                    升数 L
                  </Label>
                  <Input
                    id="edit-liters"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="选填"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    className="h-10 bg-background font-mono"
                  />
                </div>

                <label className="flex h-10 cursor-pointer items-center gap-2 font-mono text-[13px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={full}
                    onChange={(e) => setFull(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  加满
                </label>
              </div>

              {error ? (
                <p role="alert" className="m-0 text-[13px] text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" size="sm" className="font-mono font-semibold">
                  保存
                </Button>
              </div>
            </form>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
