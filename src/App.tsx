import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ConfirmDialog, type ConfirmRequest } from '@/components/ConfirmDialog.tsx'
import { EconomyPanel } from '@/components/EconomyPanel.tsx'
import { EditRecordDialog } from '@/components/EditRecordDialog.tsx'
import { EntryForm } from '@/components/EntryForm.tsx'
import { NoticeBanner } from '@/components/NoticeBanner.tsx'
import { RecordList } from '@/components/RecordList.tsx'
import { SpendChart } from '@/components/SpendChart.tsx'
import { SummaryPanel } from '@/components/SummaryPanel.tsx'
import { SyncPanel, type SyncStatus } from '@/components/SyncPanel.tsx'
import { ThemeToggle } from '@/components/ThemeToggle.tsx'
import { Toast, type ToastMessage } from '@/components/Toast.tsx'
import {
  getSignedInEmail,
  isCloudConfigured,
  onAuthChange,
  pullCloud,
  pushCloud,
  signIn,
  signOut,
  signUp,
  type CloudSnapshot,
} from '@/lib/cloud.ts'
import { todayISO } from '@/lib/format.ts'
import {
  allYears,
  economySegments,
  economySummary,
  monthKey,
  segmentPer100km,
  summaryCards,
  yearlySummary,
} from '@/lib/stats.ts'
import {
  decodeStored,
  load,
  parseImport,
  PRE_WIPE_BACKUP_KEY,
  save,
  serialize,
  serializeCsv,
  STORAGE_KEY,
  type Notice,
  type StorageLike,
} from '@/lib/store.ts'
import { resolveStorage } from '@/lib/storage.ts'
import {
  DAY_MS,
  decideSync,
  markDirty,
  markSynced,
  mergeRecords,
  normalizeEmail,
  readLastCopied,
  readSyncMeta,
  shouldGuardPullWipe,
  shouldRemindBackup,
  writeLastCopied,
  writeSyncMeta,
  type ConflictSummary,
  type SyncMeta,
} from '@/lib/sync.ts'
import {
  applyThemeClass,
  readSavedTheme,
  saveTheme,
  systemPrefersDark,
  type Theme,
} from '@/lib/theme.ts'
import type { FuelRecord } from '@/lib/types.ts'

type Boot = { storage: StorageLike; records: FuelRecord[]; notice: Notice | null }

/** 登录/注册的结果。错误已经翻成人话，面板直接显示。 */
type AuthResult = { ok: true; info?: string } | { ok: false; error: string }

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

  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  const [isDark, setIsDark] = useState(false)
  const [editingRecord, setEditingRecord] = useState<FuelRecord | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toastSeqRef = useRef(0)

  const showToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    toastSeqRef.current += 1
    setToast({ id: toastSeqRef.current, text, tone })
  }, [])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  // ---- 云同步：localStorage 仍是主存储，Supabase 是那份「反正不会丢」的副本 ----
  const [cloudEnabled] = useState(isCloudConfigured)
  const [email, setEmail] = useState<string | null>(null)
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(() => readSyncMeta(storage))
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudEnabled ? 'syncing' : 'signed-out')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [conflictSummary, setConflictSummary] = useState<ConflictSummary | null>(null)
  const [lastCopiedAt, setLastCopiedAt] = useState<number | null>(() => readLastCopied(storage))

  /**
   * 启动时没读到真实数据（损坏，或存储不可用退到了内存），此刻的 records 是一个
   * 「被迫为空」的列表，不是用户的数据。这时推送会把云端那份真实的记录整份清空，
   * 所以整个会话都不上传（拉取仍然允许——那反而是把数据救回来的路）。
   * notice 只在启动时定一次，之后不会变，用它判断就够了。
   */
  const syncSuspended = notice !== null

  /** 定时器和异步回调读这些 ref，避免拿到过期闭包里的值 */
  const recordsRef = useRef(records)
  recordsRef.current = records
  const metaRef = useRef(syncMeta)
  metaRef.current = syncMeta
  const emailRef = useRef(email)
  emailRef.current = email
  const syncStatusRef = useRef(syncStatus)
  syncStatusRef.current = syncStatus
  /** 同一时刻只跑一轮同步，否则两次推送会互相覆盖 revision */
  const syncBusyRef = useRef(false)
  /** 本地改动后的 2 秒防抖推送定时器，只在真的改了本地数据时才调度 */
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 上次成功拉取云端的时间戳，用于切回前台时节流拉取（30 秒内不重复拉） */
  const lastPullAtRef = useRef(0)

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
   * 更新并持久化同步元信息。
   *
   * 副作用刻意放在 setState 的 updater 之外：updater 在 StrictMode 下会被调用两次，
   * 在里面写盘就会重复写。这里先更新 ref，保证同一 tick 内连续调用不会互相覆盖。
   */
  function updateMeta(next: SyncMeta | null): void {
    metaRef.current = next
    setSyncMeta(next)
    writeSyncMeta(storage, next)
  }

  function cancelAutoSync(): void {
    if (autoSyncTimerRef.current !== null) {
      clearTimeout(autoSyncTimerRef.current)
      autoSyncTimerRef.current = null
    }
  }

  function scheduleAutoSync(): void {
    if (!cloudEnabled || syncSuspended || emailRef.current === null) return
    if (syncStatusRef.current === 'conflict') return
    cancelAutoSync()
    autoSyncTimerRef.current = setTimeout(() => {
      autoSyncTimerRef.current = null
      void runSync()
    }, 2000)
  }

  function failSync(message: string): void {
    setSyncError(message)
    syncStatusRef.current = 'error'
    setSyncStatus('error')
  }

  /** 云端那份成为权威副本：替换本机数据。 */
  function adoptRemote(who: string, meta: SyncMeta | null, remote: CloudSnapshot): void {
    recordsRef.current = remote.records
    setRecords(remote.records)
    const saved = save(storage, remote.records)
    setSaveError(saved.ok ? null : saved.error)
    updateMeta(markSynced(meta, who, remote.revision, Date.now()))
    setConflictSummary(null)
    setSyncError(null)
    syncStatusRef.current = 'synced'
    setSyncStatus('synced')
  }

  /** 把本机这份整份推上去。 */
  async function pushLocal(who: string, meta: SyncMeta | null): Promise<void> {
    if (syncSuspended) {
      // 用户亲手点的要说清楚为什么没传；自动触发的也会走到这里，只是一句提示
      syncStatusRef.current = 'pending'
      setSyncStatus('pending')
      setSyncError(
        '本地数据没有正常读出，已暂停上传，以免用空列表覆盖云端。请先用「备份」→「导入」从备份恢复。',
      )
      return
    }
    const pushed = await pushCloud(recordsRef.current)
    if (!pushed.ok) {
      failSync(pushed.error)
      return
    }
    updateMeta(markSynced(meta, who, pushed.value, Date.now()))
    setConflictSummary(null)
    setSyncError(null)
    syncStatusRef.current = 'synced'
    setSyncStatus('synced')
  }

  /**
   * 无损合并本机与云端记录：以云端为底追加本机独有记录。
   * 先在本地安全落盘并记录云端基线 revision + dirty=true，再推回云端：
   * 即使推送时断网，两边记录也已经安全保存在本机，联网后会自动补传。
   */
  async function mergeAndSync(
    who: string,
    meta: SyncMeta | null,
    remote: CloudSnapshot,
  ): Promise<void> {
    const { records: merged, addedFromLocal } = mergeRecords(recordsRef.current, remote.records)
    if (addedFromLocal === 0) {
      adoptRemote(who, meta, remote)
      return
    }

    recordsRef.current = merged
    setRecords(merged)
    persist(merged)

    const pendingMeta: SyncMeta = {
      email: normalizeEmail(who),
      remoteRevision: remote.revision,
      dirty: true,
      lastSyncedAt: meta?.lastSyncedAt ?? null,
    }
    updateMeta(pendingMeta)
    setConflictSummary(null)

    if (syncSuspended) {
      syncStatusRef.current = 'pending'
      setSyncStatus('pending')
      setSyncError(
        `已在本机合并两边记录（共 ${merged.length} 条），但因本地存储异常暂不上传。请先导出备份。`,
      )
      return
    }

    const pushed = await pushCloud(merged)
    if (!pushed.ok) {
      failSync(`已在本机合并两边记录（共 ${merged.length} 条），但上传云端失败：${pushed.error}`)
      return
    }
    updateMeta(markSynced(pendingMeta, who, pushed.value, Date.now()))
    setSyncError(null)
    syncStatusRef.current = 'synced'
    setSyncStatus('synced')
  }

  /**
   * 跑一轮同步。
   *
   * 默认先拉一次再决策：只有几百条记录，一次请求换来「云端到底有什么」的确切答案，
   * 比拿时间戳去猜可靠得多。force 用于冲突时用户手动选择合并或覆盖。
   */
  async function runSync(force?: 'push' | 'pull' | 'merge'): Promise<void> {
    if (!cloudEnabled) return
    cancelAutoSync()
    const who = normalizeEmail(emailRef.current)
    if (who === null) {
      syncStatusRef.current = 'signed-out'
      setSyncStatus('signed-out')
      return
    }
    if (syncBusyRef.current) return
    syncBusyRef.current = true
    syncStatusRef.current = 'syncing'
    setSyncStatus('syncing')
    setSyncError(null)

    try {
      // 换过账号：旧账号的 revision 绝不能拿来用，否则会把别人的版本号当自己的
      let meta = metaRef.current
      const metaEmail = normalizeEmail(meta?.email)
      if (meta !== null && metaEmail !== null && metaEmail !== who) {
        updateMeta(null)
        meta = null
      }

      if (force === 'push') {
        await pushLocal(who, meta)
        return
      }

      const pulled = await pullCloud()
      if (!pulled.ok) {
        failSync(pulled.error)
        return
      }
      lastPullAtRef.current = Date.now()
      const remote = pulled.value

      if (force === 'pull') {
        adoptRemote(who, meta, remote)
        return
      }

      if (force === 'merge') {
        await mergeAndSync(who, meta, remote)
        return
      }

      const action = decideSync({
        meta,
        localCount: recordsRef.current.length,
        remoteCount: remote.records.length,
        remoteRevision: remote.revision,
      })

      if (action === 'nothing') {
        updateMeta(markSynced(meta, who, remote.revision, Date.now()))
        setConflictSummary(null)
        syncStatusRef.current = 'synced'
        setSyncStatus('synced')
        return
      }

      if (action === 'pull') {
        // 防连锁清空：如果云端突然变空而本机仍有较多历史记录，拦截静默覆盖，
        // 先原样备份到本地 key，再交由用户确认是恢复云端还是清空本机。
        if (shouldGuardPullWipe(recordsRef.current.length, remote.records.length)) {
          try {
            storage.setItem(PRE_WIPE_BACKUP_KEY, serialize(recordsRef.current))
          } catch {
            /* 忽略备份写入失败，下面仍会拦截清空 */
          }
          const merged = mergeRecords(recordsRef.current, remote.records)
          setConflictSummary({
            localCount: recordsRef.current.length,
            remoteCount: remote.records.length,
            mergedCount: merged.records.length,
          })
          syncStatusRef.current = 'conflict'
          setSyncStatus('conflict')
          setSyncError(
            `云端记录已变为空（0 条），但本机仍有 ${recordsRef.current.length} 条历史记录。为防止连锁清空，已拦截自动覆盖，请在「备份」面板确认。`,
          )
          return
        }
        adoptRemote(who, meta, remote)
        return
      }

      if (action === 'merge') {
        await mergeAndSync(who, meta, remote)
        return
      }

      if (action === 'conflict') {
        // 两边都可能带着对方没有的改动，自动选边就是静默丢数据。交给用户点（提供合并或覆盖）。
        // 同时把两边条数写进横幅和面板：让用户做决定前一眼看清差距。
        const merged = mergeRecords(recordsRef.current, remote.records)
        setConflictSummary({
          localCount: recordsRef.current.length,
          remoteCount: remote.records.length,
          mergedCount: merged.records.length,
        })
        syncStatusRef.current = 'conflict'
        setSyncStatus('conflict')
        setSyncError(
          `云端（${remote.records.length} 条）和本机（${recordsRef.current.length} 条）都改过，请在「备份」面板里选择合并或保留一边。`,
        )
        return
      }

      await pushLocal(who, meta)
    } finally {
      syncBusyRef.current = false
    }
  }

  /** 首次登录/注册成功后接管：建立归属，然后立刻同步一轮。 */
  async function finishAuth(who: string): Promise<void> {
    const normalized = normalizeEmail(who)
    if (normalized === null) return
    const previous = metaRef.current
    const prevEmail = normalizeEmail(previous?.email)
    if (previous !== null && prevEmail !== null && prevEmail !== normalized) {
      updateMeta(null)
    }
    emailRef.current = normalized
    setEmail(normalized)
    await runSync()
  }

  async function handleSignIn(address: string, password: string): Promise<AuthResult> {
    const result = await signIn(address, password)
    if (!result.ok) return result
    await finishAuth(result.value)
    return { ok: true }
  }

  async function handleSignUp(address: string, password: string): Promise<AuthResult> {
    const created = await signUp(address, password)
    if (!created.ok) return created
    if (created.value.needsConfirm) {
      return { ok: true, info: '注册成功。请去邮箱点确认链接，确认后回来登录。' }
    }
    await finishAuth(created.value.email)
    return { ok: true, info: '注册成功，已登录。' }
  }

  async function handleSignOut(): Promise<void> {
    cancelAutoSync()
    await signOut()
    emailRef.current = null
    setEmail(null)
    setConflictSummary(null)
    setSyncError(null)
    syncStatusRef.current = 'signed-out'
    setSyncStatus('signed-out')
  }

  /** 冲突时由用户确认后用云端覆盖本机（会丢掉本机独有改动）。 */
  function handleUseCloud(): void {
    const localCount = recordsRef.current.length
    const remoteCount = conflictSummary?.remoteCount
    if (localCount === 0) {
      void runSync('pull')
      return
    }
    const detail =
      remoteCount !== undefined
        ? `将用云端的 ${remoteCount} 条记录覆盖本机的 ${localCount} 条记录，本机未同步的改动将丢失。`
        : `将用云端记录覆盖本机的 ${localCount} 条记录，本机未同步的改动将丢失。`
    setConfirmRequest({
      title: '用云端覆盖本机？',
      description: `${detail}\n\n此操作不可撤销。`,
      confirmLabel: '确认覆盖本机',
      destructive: true,
      onConfirm: () => {
        void runSync('pull')
      },
    })
  }

  /** 冲突时由用户确认后用本机覆盖云端（可能清除云端历史记录）。 */
  function handleKeepLocal(): void {
    const localCount = recordsRef.current.length
    const remoteCount = conflictSummary?.remoteCount
    if (remoteCount === 0) {
      void runSync('push')
      return
    }
    const dropNote =
      remoteCount !== undefined && localCount < remoteCount
        ? `（云端将减少 ${remoteCount - localCount} 条历史记录）`
        : ''
    const detail =
      remoteCount !== undefined
        ? `将用本机的 ${localCount} 条记录整份替换云端的 ${remoteCount} 条记录${dropNote}。`
        : `将用本机的 ${localCount} 条记录整份替换云端全部数据。`
    setConfirmRequest({
      title: '用本机覆盖云端？',
      description: `${detail}\n\n此操作不可撤销。`,
      confirmLabel: '确认覆盖云端',
      destructive: true,
      onConfirm: () => {
        void runSync('push')
      },
    })
  }

  /** 本机有了改动：落盘 + 标记待上传 + 调度 2 秒防抖同步。 */
  function markLocalChange(): void {
    const meta = metaRef.current
    if (meta !== null) updateMeta(markDirty(meta))
    if (emailRef.current !== null && syncStatusRef.current !== 'conflict') {
      syncStatusRef.current = 'pending'
      setSyncStatus('pending')
      scheduleAutoSync()
    }
  }

  /**
   * 落盘并把结果如实反映到横幅上。把错误一并返回，是因为调用方往往要在同一次
   * 事件里做决定（比如导入后该说「成功」还是「导入成功但没存住」），
   * 而 saveError 这个 state 要到下一次渲染才更新，读到的会是旧值。
   */
  function persist(next: FuelRecord[]): { ok: boolean; error: string | null } {
    const result = save(storage, next)
    const error = result.ok ? null : result.error
    setSaveError(error)
    return { ok: result.ok, error }
  }

  /** 用户改动：立刻写 localStorage（刷新不丢），云端交给 2 秒后的防抖推送。 */
  function applyLocal(next: FuelRecord[]): { ok: boolean; error: string | null } {
    recordsRef.current = next
    setRecords(next)
    const saved = persist(next)
    markLocalChange()
    return saved
  }

  // 别的标签页写了数据就跟着换成那份。否则这边再记一笔时会拿自己手里的旧列表
  // 整体覆盖回去，那边刚记的就无声消失了。storage 事件只在「别的」标签页写入时触发。
  // 读不懂的新值不接（保持现状），损坏处理只在启动时的 load() 里做一次。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const decoded = decodeStored(event.newValue)
      if (decoded.status !== 'ok' && decoded.status !== 'empty') return
      recordsRef.current = decoded.records
      setRecords(decoded.records)
      // 另一个标签页刚改过，云端还没有；新一轮推送是幂等的，多推一次无害
      markLocalChange()
    }
    globalThis.addEventListener?.('storage', onStorage)
    return () => globalThis.removeEventListener?.('storage', onStorage)
  }, [])

  // 启动时恢复登录态并同步一轮。只读会话、不弹窗，所以放在挂载流程里是安全的。
  useEffect(() => {
    if (!cloudEnabled) return
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void (async () => {
      const off = await onAuthChange((nextEmail) => {
        if (cancelled) return
        emailRef.current = nextEmail
        setEmail(nextEmail)
        if (nextEmail === null) {
          cancelAutoSync()
          setConflictSummary(null)
          syncStatusRef.current = 'signed-out'
          setSyncStatus('signed-out')
          setSyncError(null)
        }
      })
      if (cancelled) {
        off()
        return
      }
      unsubscribe = off

      // getSession 是本地读取（必要时才刷新 token），不会弹任何窗口
      const current = await getSignedInEmail()
      if (cancelled) return
      emailRef.current = current
      setEmail(current)
      if (current === null) {
        syncStatusRef.current = 'signed-out'
        setSyncStatus('signed-out')
        return
      }
      await runSync()
    })()

    return () => {
      cancelled = true
      cancelAutoSync()
      unsubscribe?.()
    }
  }, [cloudEnabled])

  // 网络恢复、切回前台、切后台/离开页面时的生命周期同步与跨年刷新：
  // - 断网恢复（online）：自动补传未同步改动或拉取最新云端数据
  // - 切后台/关闭页面（hidden / pagehide）：若有排队的 2 秒防抖推送，立即发出去，避免手机刚记完就锁屏丢推送
  // - 切回前台（visible）：跨年时刷新当前年份；已登录且有脏数据/出错/超过 30 秒没拉过时自动同步
  useEffect(() => {
    const flushPendingSync = () => {
      if (!cloudEnabled || syncSuspended || emailRef.current === null) return
      if (syncStatusRef.current === 'conflict') return
      if (autoSyncTimerRef.current !== null) {
        cancelAutoSync()
        void runSync()
      }
    }

    const onOnline = () => {
      if (!cloudEnabled || emailRef.current === null) return
      if (syncStatusRef.current === 'conflict') return
      void runSync()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSync()
        return
      }
      if (document.visibilityState !== 'visible') return

      const nowYear = new Date().getFullYear()
      setCurrentYear((prev) => (prev === nowYear ? prev : nowYear))

      if (!cloudEnabled || emailRef.current === null) return
      if (syncStatusRef.current === 'conflict') return
      const stalePull = Date.now() - lastPullAtRef.current > 30_000
      if (metaRef.current?.dirty || syncStatusRef.current === 'error' || stalePull) {
        void runSync()
      }
    }

    globalThis.addEventListener?.('online', onOnline)
    globalThis.addEventListener?.('pagehide', flushPendingSync)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      globalThis.removeEventListener?.('online', onOnline)
      globalThis.removeEventListener?.('pagehide', flushPendingSync)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cloudEnabled, syncSuspended])

  function handleAdd(record: FuelRecord) {
    applyLocal([...records, record])

    // 跳到刚记下的那个月份。否则记一笔上个月的账时，界面上什么都不会变，
    // 用户会以为没记上。
    setYear(Number(record.date.slice(0, 4)))
    setMonth(Number(record.date.slice(5, 7)))
  }

  function handleEdit(updated: FuelRecord) {
    applyLocal(records.map((r) => (r.id === updated.id ? updated : r)))
    setYear(Number(updated.date.slice(0, 4)))
    setMonth(Number(updated.date.slice(5, 7)))
    showToast('已更新记录。')
  }

  function handleDelete(id: string) {
    applyLocal(records.filter((r) => r.id !== id))
  }

  function handleToggleTheme() {
    const next: Theme = isDark ? 'light' : 'dark'
    saveTheme(storage, next)
    applyThemeClass(next)
    setIsDark(next === 'dark')
  }

  function triggerDownload(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    // 不能紧跟着 revoke：Safari / Firefox 的下载是异步开始的，立刻释放偶尔会下载失败
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function handleExport() {
    triggerDownload(serialize(records), 'application/json', `gasnote-backup-${todayISO()}.json`)
    // 手动导出同样算「拿到了一份数据副本」，用来消掉超期提醒
    const now = Date.now()
    writeLastCopied(storage, now)
    setLastCopiedAt(now)
    showToast(`已导出 JSON 备份（${records.length} 条记录）。`)
  }

  function handleExportCsv() {
    const segs = economySegments(records)
    const per100Map = new Map(segs.map((s) => [s.endId, segmentPer100km(s)]))
    triggerDownload(
      serializeCsv(records, per100Map),
      'text/csv;charset=utf-8',
      `gasnote-${todayISO()}.csv`,
    )
    const now = Date.now()
    writeLastCopied(storage, now)
    setLastCopiedAt(now)
    showToast(`已导出 CSV 表格（${records.length} 条记录）。`)
  }

  /**
   * 导入是唯一可能一次性毁掉全部数据的操作，所以：
   * 先全量解析校验（parseImport），通过了才弹窗确认并覆盖。任何一步失败都保持现状不动。
   */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // 允许连续导入同一个文件
    if (!file) return

    let text: string
    try {
      text = await file.text()
    } catch {
      showToast('读取文件失败。', 'error')
      return
    }

    const parsed = parseImport(text)
    if (!parsed.ok) {
      showToast(`导入失败，数据未改动：${parsed.error}`, 'error')
      return
    }

    setConfirmRequest({
      title: '确认导入并替换当前记录？',
      description: `将用文件里的 ${parsed.records.length} 条记录替换当前的 ${records.length} 条记录。\n\n此操作不可撤销。`,
      confirmLabel: '确认导入',
      destructive: records.length > 0,
      onConfirm: () => {
        // 落盘失败必须同时进横幅，不能在没落盘的情况下说「已导入成功」。
        const saved = applyLocal(parsed.records)
        if (saved.ok) {
          showToast(`已导入 ${parsed.records.length} 条记录。`)
        } else {
          showToast(
            `已导入 ${parsed.records.length} 条记录，但保存失败，刷新后会丢失。`,
            'error',
          )
        }
      },
    })
  }

  // 派生数据
  const now = new Date()
  const cards = summaryCards(records, year, now)
  const summary = yearlySummary(records, year)
  const years = allYears(records, currentYear)
  const segments = economySegments(records)
  // 按区间结束那次加满的日期归年，与「本年」卡跟随年份选择器的口径一致
  const yearEconomy = economySummary(segments.filter((s) => s.endDate.startsWith(`${year}-`)))
  const latestSegment = segments.length > 0 ? segments[segments.length - 1] : null
  const per100kmById = new Map(segments.map((s) => [s.endId, segmentPer100km(s)]))

  // 同步正常工作时不该再唠叨，所以只在没登录 / 出错 / 站点没配 Supabase 时才提醒。
  // 时间是每天才变一次的量，不值得进 useMemo。
  const syncHealthy =
    email !== null && syncError === null && syncStatus !== 'conflict' && syncStatus !== 'error'
  const lastCopyAt = Math.max(syncMeta?.lastSyncedAt ?? 0, lastCopiedAt ?? 0) || null
  const reminder =
    !syncHealthy && shouldRemindBackup(lastCopyAt, Date.now(), records.length)
      ? `${
          lastCopyAt === null
            ? `还没有备份过，现有 ${records.length} 条记录只存在这个浏览器里。`
            : `已经 ${Math.floor((Date.now() - lastCopyAt) / DAY_MS)} 天没有备份了（现有 ${records.length} 条记录）。`
        }${
          cloudEnabled
            ? '点右上角「备份」登录后，每次改动都会自动同步到 Supabase。'
            : '这个站点还没有配置 Supabase，请点右上角「备份」→「导出」手动存一份。'
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
          <div className="flex items-center gap-1.5">
            <SyncPanel
              configured={cloudEnabled}
              email={email}
              status={syncStatus}
              lastSyncedAt={syncMeta?.lastSyncedAt ?? null}
              error={syncError}
              conflict={conflictSummary}
              onSignIn={handleSignIn}
              onSignUp={handleSignUp}
              onSignOut={() => void handleSignOut()}
              onSyncNow={() => void runSync()}
              onMerge={() => void runSync('merge')}
              onUseCloud={handleUseCloud}
              onKeepLocal={handleKeepLocal}
              onExport={handleExport}
              onExportCsv={handleExportCsv}
              onImport={() => fileRef.current?.click()}
            />
            <ThemeToggle isDark={isDark} onToggle={handleToggleTheme} />
          </div>
        </header>

        <main className="flex flex-col gap-3 pt-4">
          <NoticeBanner
            notice={notice}
            saveError={saveError}
            syncError={syncError}
            reminder={reminder}
          />
          <EntryForm records={records} onAdd={handleAdd} />
          <SummaryPanel cards={cards} year={year} />
          <EconomyPanel
            latest={latestSegment}
            yearSummary={yearEconomy}
            year={year}
            isCurrentYear={cards.isCurrentYear}
          />
          <SpendChart
            year={year}
            years={years}
            selectedMonth={month}
            summary={summary}
            onYearChange={setYear}
            onMonthSelect={setMonth}
          />
          <RecordList
            year={year}
            month={month}
            records={monthRecords}
            per100kmById={per100kmById}
            onEdit={setEditingRecord}
            onDelete={handleDelete}
          />
        </main>
      </div>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      <EditRecordDialog
        record={editingRecord}
        records={records}
        onSave={handleEdit}
        onClose={() => setEditingRecord(null)}
      />
      <Toast toast={toast} onDismiss={dismissToast} />

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
