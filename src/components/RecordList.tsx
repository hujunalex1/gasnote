import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { formatMoney } from '@/lib/format.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Props = {
  year: number
  month: number
  /** 已按「日期降序、同日新录入在前」排好的当月记录 */
  records: FuelRecord[]
  onDelete: (id: string) => void
}

export function RecordList({ year, month, records, onDelete }: Props) {
  // 只允许一行处于「确认删除」态，点别处或点否都会退回
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <section className="rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10">
      <h2 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">
        {year} 年 {month} 月明细
      </h2>

      {records.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">还没有记录，在上面记第一笔。</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {records.map((record) => {
            const confirming = confirmingId === record.id
            return (
              <li
                key={record.id}
                className="flex items-center gap-3.5 border-t border-border py-2.5 first:border-t-0 first:pt-1"
              >
                <span className="w-12 shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {record.date.slice(5)}
                </span>
                <span className="font-semibold tabular-nums">{formatMoney(record.amount)}</span>
                {record.note ? (
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {record.note}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-1.5">
                  {confirming ? (
                    <>
                      <span className="text-[13px] text-destructive">确认删除？</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          onDelete(record.id)
                          setConfirmingId(null)
                        }}
                      >
                        是
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmingId(null)}>
                        否
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmingId(record.id)}
                    >
                      删除
                    </Button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
