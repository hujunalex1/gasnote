import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { BackupPanel } from '@/components/BackupPanel.tsx'
import { EntryForm } from '@/components/EntryForm.tsx'
import { NoticeBanner } from '@/components/NoticeBanner.tsx'
import { RecordList } from '@/components/RecordList.tsx'
import { SpendChart } from '@/components/SpendChart.tsx'
import { SummaryPanel } from '@/components/SummaryPanel.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { DAY_MS, shouldRemindExport } from '@/lib/backup.ts'
import {
  clearDirectoryHandle,
  describeBackupError,
  hasWritePermission,
  isBackupSupported,
  loadDirectoryHandle,
  pickBackupDirectory,
  readBackupMeta,
  runBackup,
  saveDirectoryHandle,
  writeBackupMeta,
  type BackupMeta,
} from '@/lib/fileBackup.ts'
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

  // ---- 自动备份：localStorage 仍是主存储，备份只是单向落盘 ----
  const [backupSupported] = useState(isBackupSupported)
  const [backupMeta, setBackupMeta] = useState<BackupMeta>(() => readBackupMeta(storage))
  const [needsPermission, setNeedsPermission] = useState(false)
  const [backupError, setBackupError] = useState<string | null>(null)
  /**
   * 启动时没读到真实数据（损坏，或存储不可用退到了内存），此刻的 records 是一个
   * 「被迫为空」的列表，不是用户的数据。这时写盘会用空列表覆盖当天那份真实快照，
   * 连续几天不处理还会让 14 份滚动保留把有效备份全部挤掉。所以整个会话都不写。
   * notice 只在启动时定一次，之后不会变，用它判断就够了。
   */
  const backupSuspended = notice !== null
  /** 目录句柄本身存在 IndexedDB 里，这里只是内存中的当前引用 */
  const backupHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  /** 定时器回调读它，避免拿到过期的 records */
  const recordsRef = useRef(records)
  recordsRef.current = records
  /** 同上：连续更新元信息时不互相覆盖 */
  const metaRef = useRef(backupMeta)
  metaRef.current = backupMeta

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

  /**
   * 更新并持久化备份元信息。
   *
   * 副作用刻意放在 setState 的 updater 之外：updater 在 StrictMode 下会被调用两次，
   * 在里面写盘就会重复写。这里先更新 ref，保证同一 tick 内连续调用不会互相覆盖。
   */
  function updateMeta(patch: Partial<BackupMeta>): void {
    const next = { ...metaRef.current, ...patch }
    metaRef.current = next
    setBackupMeta(next)
    writeBackupMeta(storage, next)
  }

  /**
   * 跑一次备份。
   *
   * request=false 时只查询权限、不弹窗，所以挂在定时器和挂载流程里是安全的；
   * request=true 只能在用户点击的调用栈里用——浏览器要求申请权限必须来自手势。
   */
  async function backupNow(request: boolean): Promise<void> {
    const handle = backupHandleRef.current
    if (!handle) return
    if (backupSuspended) {
      // 自动触发的静默跳过；用户亲手点的要说清楚为什么没写
      if (request) {
        setBackupError(
          '本地数据没有正常读出，自动备份已暂停，以免用空列表覆盖磁盘上已有的备份。请先用「导入」从备份恢复。',
        )
      }
      return
    }
    setBackupError(null)
    try {
      if (!(await hasWritePermission(handle, request))) {
        setNeedsPermission(true)
        return
      }
      setNeedsPermission(false)
      const outcome = await runBackup(handle, todayISO(), serialize(recordsRef.current))
      if (!outcome.ok) {
        if (outcome.reason === 'no-permission') setNeedsPermission(true)
        else setBackupError(describeBackupError(outcome.error))
        return
      }
      updateMeta({ lastCopiedAt: Date.now() })
    } catch (error) {
      setBackupError(describeBackupError(error))
    }
  }

  async function handleEnableBackup(): Promise<void> {
    try {
      const dir = await pickBackupDirectory()
      if (!dir) return // 用户取消，不是错误
      if (!(await hasWritePermission(dir, true))) {
        setBackupError('没有拿到备份目录的写入权限，自动备份没有开启。')
        return
      }
      await saveDirectoryHandle(dir)
      backupHandleRef.current = dir
      setBackupError(null)
      setNeedsPermission(false)
      updateMeta({ dirName: dir.name })
      // 立刻写一份，别让用户等到下次改动才看见效果
      await backupNow(false)
    } catch (error) {
      setBackupError(describeBackupError(error))
    }
  }

  async function handleDisableBackup(): Promise<void> {
    try {
      await clearDirectoryHandle()
    } catch {
      /* 句柄清不掉不该卡住"关闭"这个动作 */
    }
    backupHandleRef.current = null
    setNeedsPermission(false)
    setBackupError(null)
    // 只断开连接，不删磁盘上已经写好的备份——那是用户的文件，删了不可逆
    updateMeta({ dirName: null })
  }

  // 启动时恢复备份目录。只查询权限、绝不申请：申请必须来自用户手势，
  // 在挂载流程里调用会被浏览器直接拒绝。
  useEffect(() => {
    if (!backupSupported) return
    let cancelled = false
    void (async () => {
      const handle = await loadDirectoryHandle()
      if (!handle || cancelled) return
      backupHandleRef.current = handle
      const granted = await hasWritePermission(handle, false)
      if (cancelled) return
      setNeedsPermission(!granted)
      updateMeta({ dirName: handle.name })
    })()
    return () => {
      cancelled = true
    }
  }, [backupSupported])

  // 改动后 2 秒写盘；挂载时也会跑一次，顺手刷新当天那份快照。
  // 只有权限已经是 granted 才会真写，所以这里不会弹权限窗。
  useEffect(() => {
    if (!backupSupported || backupSuspended || backupMeta.dirName === null) return
    const timer = setTimeout(() => void backupNow(false), 2000)
    return () => clearTimeout(timer)
  }, [records, backupSupported, backupMeta.dirName])

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
    // 手动导出同样算"拿到了一份数据副本"，用来消掉超期提醒
    updateMeta({ lastCopiedAt: Date.now() })
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

  // 自动备份正常工作时不该再唠叨，所以只在它不可用/没开/出问题时才算提醒。
  // 时间是每天才变一次的量，不值得进 useMemo。
  const autoBackupHealthy =
    backupMeta.dirName !== null && !needsPermission && backupError === null
  const reminder =
    !autoBackupHealthy &&
    shouldRemindExport(backupMeta.lastCopiedAt, Date.now(), records.length)
      ? `${
          backupMeta.lastCopiedAt === null
            ? `还没有备份过，现有 ${records.length} 条记录只存在这个浏览器里。`
            : `已经 ${Math.floor((Date.now() - backupMeta.lastCopiedAt) / DAY_MS)} 天没有备份了（现有 ${records.length} 条记录）。`
        }${
          backupSupported
            ? '点右上角「自动备份」可以让它每次改动都自动写一份。'
            : '这个浏览器不支持自动写盘，请点「导出」手动存一份。'
        }`
      : null

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
          {/* flex-wrap：多了「自动备份」之后窄屏放不下，让它换行而不是溢出 */}
          <div className="flex flex-wrap justify-end gap-1.5">
            <ThemeToggle isDark={isDark} onToggle={handleToggleTheme} />
            <BackupPanel
              supported={backupSupported}
              dirName={backupMeta.dirName}
              needsPermission={needsPermission}
              lastCopiedAt={backupMeta.lastCopiedAt}
              onEnable={() => void handleEnableBackup()}
              onDisable={() => void handleDisableBackup()}
              onBackupNow={() => void backupNow(true)}
            />
            <Button variant="outline" size="sm" onClick={handleExport}>
              导出
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              导入
            </Button>
          </div>
        </header>

        <main className="flex flex-col gap-3 pt-4">
          <NoticeBanner
            notice={notice}
            saveError={saveError}
            backupError={backupError}
            reminder={reminder}
          />
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
