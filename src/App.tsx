import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { EntryForm } from '@/components/EntryForm.tsx'
import { NoticeBanner } from '@/components/NoticeBanner.tsx'
import { RecordList } from '@/components/RecordList.tsx'
import { SpendChart } from '@/components/SpendChart.tsx'
import { SummaryPanel } from '@/components/SummaryPanel.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { todayISO } from '@/lib/format.ts'
import { allYears, monthKey, summaryCards, yearlySummary } from '@/lib/stats.ts'
import { load, parseImport, save, serialize, type Notice, type StorageLike } from '@/lib/store.ts'
import { resolveStorage } from '@/lib/storage.ts'
import {
  applyThemeClass,
  readSavedTheme,
  saveTheme,
  systemPrefersDark,
  type Theme,
} from '@/lib/theme.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Boot = { storage: StorageLike; records: FuelRecord[]; notice: Notice | null }

/** 只在首次渲染跑一次：解析存储、读回数据、定下初始提示。 */
function boot(): Boot {
  const { storage, unavailable } = resolveStorage()
  const loaded = load(storage)
  return {
    storage,
    records: loaded.records,
    // 内存模式优先于 corrupt 提示：那才是用户此刻最该知道的事
    notice: unavailable ? { kind: 'storage-unavailable' } : loaded.notice,
  }
}

export function App() {
  const [booted] = useState(boot)
  const { storage } = booted

  const [records, setRecords] = useState<FuelRecord[]>(booted.records)
  const [notice] = useState<Notice | null>(booted.notice)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [currentYear] = useState(() => new Date().getFullYear())
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const [isDark, setIsDark] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 主题：首屏类名已由 index.html 的内联脚本挂好，这里只同步 React 状态
  useEffect(() => {
    const saved = readSavedTheme(storage)
    applyThemeClass(saved)
    setIsDark(saved ? saved === 'dark' : systemPrefersDark())

    // 用户没手动选过时，跟随系统实时切换
    const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readSavedTheme(storage) === null) {
        applyThemeClass(null)
        setIsDark(systemPrefersDark())
      }
    }
    query?.addEventListener?.('change', onChange)
    return () => query?.removeEventListener?.('change', onChange)
  }, [storage])

  /** 落盘并把结果如实反映到横幅上。返回是否成功，让调用方决定怎么措辞。 */
  function persist(next: FuelRecord[]): boolean {
    const result = save(storage, next)
    setSaveError(result.ok ? null : result.error)
    return result.ok
  }

  function handleAdd(record: FuelRecord) {
    const next = [...records, record]
    setRecords(next)
    persist(next)

    // 跳到刚记下的那个月份。否则记一笔上个月的账时，界面上什么都不会变，
    // 用户会以为没记上。
    setYear(Number(record.date.slice(0, 4)))
    setMonth(Number(record.date.slice(5, 7)))
  }

  function handleDelete(id: string) {
    const next = records.filter((r) => r.id !== id)
    setRecords(next)
    persist(next)
  }

  function handleToggleTheme() {
    const next: Theme = isDark ? 'light' : 'dark'
    saveTheme(storage, next)
    applyThemeClass(next)
    setIsDark(next === 'dark')
  }

  function handleExport() {
    const blob = new Blob([serialize(records)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gasnote-backup-${todayISO()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 导入是唯一可能一次性毁掉全部数据的操作，所以：
   * 先全量解析校验（parseImport），通过了才覆盖。任何一步失败都保持现状不动。
   */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // 允许连续导入同一个文件
    if (!file) return

    let text: string
    try {
      text = await file.text()
    } catch {
      window.alert('读取文件失败。')
      return
    }

    const parsed = parseImport(text)
    if (!parsed.ok) {
      window.alert(`导入失败，你的数据没有任何改动。\n\n原因：${parsed.error}`)
      return
    }

    const confirmed = window.confirm(
      `将用文件里的 ${parsed.records.length} 条记录替换当前的 ${records.length} 条记录。\n\n此操作不可撤销，确定继续？`,
    )
    if (!confirmed) return

    setRecords(parsed.records)
    // 落盘失败必须同时进横幅，不能只闪一个 alert，
    // 更不能在没落盘的情况下说「已导入成功」——那会让用户以为数据已经安全了。
    const saved = save(storage, parsed.records)
    setSaveError(saved.ok ? null : saved.error)
    window.alert(
      saved.ok
        ? `已导入 ${parsed.records.length} 条记录。`
        : `已导入 ${parsed.records.length} 条记录，但保存失败，刷新后会丢失。\n\n${saved.error}`,
    )
  }

  // 派生数据
  const now = new Date()
  const cards = summaryCards(records, year, now)
  const summary = yearlySummary(records, year)
  const years = allYears(records, currentYear)

  // 排序：日期降序；同一天内按录入顺序倒序（后录入的在前）。
  // 带上原始下标是必需的——同一天多条时只比日期会得到 0，
  // 稳定排序会原样保留插入顺序，也就是「最旧的在最前」，与 spec §5 相反。
  const monthRecords = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => monthKey(record.date) === `${year}-${String(month).padStart(2, '0')}`)
    .sort((a, b) => {
      if (a.record.date !== b.record.date) return a.record.date < b.record.date ? 1 : -1
      return b.index - a.index
    })
    .map(({ record }) => record)

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground">
      <div className="mx-auto w-full max-w-[660px] px-4 pb-16 sm:px-5">
        <header className="flex items-center justify-between gap-3 border-b border-border pt-6 pb-4">
          <h1 className="m-0 font-mono text-[15px] font-semibold tracking-[0.02em]">加油记账</h1>
          <div className="flex gap-1.5">
            <ThemeToggle isDark={isDark} onToggle={handleToggleTheme} />
            <Button variant="outline" size="sm" onClick={handleExport}>
              导出
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              导入
            </Button>
          </div>
        </header>

        <main className="flex flex-col gap-3 pt-4">
          <NoticeBanner notice={notice} saveError={saveError} />
          <EntryForm onAdd={handleAdd} />
          <SummaryPanel cards={cards} year={year} />
          <SpendChart
            year={year}
            years={years}
            selectedMonth={month}
            summary={summary}
            onYearChange={setYear}
            onMonthSelect={setMonth}
          />
          <RecordList year={year} month={month} records={monthRecords} onDelete={handleDelete} />
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={handleImportFile}
      />
    </div>
  )
}
