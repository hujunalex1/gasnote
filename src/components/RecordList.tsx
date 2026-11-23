import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import {
  formatKm,
  formatLiters,
  formatMoney,
  formatPer100km,
  formatUnitPrice,
} from '@/lib/format.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Props = {
  year: number
  month: number
  /** 已按「日期降序、同日新录入在前」排好的当月记录 */
  records: FuelRecord[]
  /** 结束了某一段的那几次加满 → 该段油耗。没有的记录不显示油耗 */
  per100kmById: Map<string, number>
  onEdit: (record: FuelRecord) => void
  onDelete: (id: string) => void
}

export function RecordList({ year, month, records, per100kmById, onEdit, onDelete }: Props) {
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
            const per100km = per100kmById.get(record.id)
            const unitPrice =
              record.liters !== undefined ? formatUnitPrice(record.amount, record.liters) : ''
            const baseDetails = [
              record.odometer !== undefined ? formatKm(record.odometer) : null,
              record.liters !== undefined
                ? `${formatLiters(record.liters)}${record.full === false ? '（未加满）' : ''}`
                : null,
              unitPrice || null,
            ].filter((part): part is string => part !== null)
            const hasDetails = baseDetails.length > 0 || per100km !== undefined

            return (
              <li
                key={record.id}
                className="border-t border-border py-2.5 first:border-t-0 first:pt-1"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-11 shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                    {record.date.slice(5)}
                  </span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums">
                    {formatMoney(record.amount)}
                  </span>
                  {record.note ? (
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                      {record.note}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}

                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    {confirming ? (
                      <>
                        <span className="mr-1 font-mono text-[12px] text-destructive">
                          确认删除？
                        </span>
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
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(record)}
                        >
                          编辑
                        </Button>
                        {/* 删除是低频操作：平时只是一行灰字，不和金额抢视线；悬停才变红。
                            真正的防误触在下一步的「确认删除？」，那一步仍是醒目的红色。 */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmingId(record.id)}
                        >
                          删除
                        </Button>
                      </>
                    )}
                  </span>
                </div>

                {/* 详情独占第二行，不再被右侧操作按钮挤占；手机端允许自然换行，油耗数字绝不被截断 */}
                {hasDetails ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[54px] font-mono text-[12px] text-muted-foreground tabular-nums">
                    {baseDetails.map((item, idx) => (
                      <span key={item}>
                        {idx > 0 ? <span className="mr-2 opacity-60">·</span> : null}
                        {item}
                      </span>
                    ))}
                    {per100km !== undefined ? (
                      <span className="font-medium text-foreground">
                        {baseDetails.length > 0 ? (
                          <span className="mr-2 font-normal text-muted-foreground opacity-60">
                            ·
                          </span>
                        ) : null}
                        {formatPer100km(per100km)} L/100km
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
