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
    <section className="border border-border bg-card px-4 py-3.5">
      <h2 className="mb-2 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground">
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
                className="flex items-center gap-3 border-t border-border py-2 first:border-t-0 first:pt-0.5"
              >
                <span className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground">
                  {record.date.slice(5)}
                </span>
                <span className="font-mono font-semibold">{formatMoney(record.amount)}</span>
                {record.note ? (
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {record.note}
                  </span>
                ) : null}

                <span className="ml-auto flex items-center gap-1.5">
                  {confirming ? (
                    <>
                      <span className="font-mono text-[12px] text-destructive">确认删除？</span>
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
                    // 删除是低频操作：平时只是一行灰字，不和金额抢视线；悬停才变红。
                    // 真正的防误触在下一步的「确认删除？」，那一步仍是醒目的红色。
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
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
