import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'error'

type AuthResult = { ok: true; info?: string } | { ok: false; error: string }

type Props = {
  /** .env.local 里有没有配 Supabase 地址与 anon key */
  configured: boolean
  /** 已登录的邮箱；null 表示没登录 */
  email: string | null
  status: SyncStatus
  lastSyncedAt: number | null
  /** 最近一次同步失败的原因（已经翻成人话） */
  error: string | null
  onSignIn: (email: string, password: string) => Promise<AuthResult>
  onSignUp: (email: string, password: string) => Promise<AuthResult>
  onSignOut: () => void
  onSyncNow: () => void
  /** 冲突时二选一：放弃本机改动 */
  onUseCloud: () => void
  /** 冲突时二选一：用本机覆盖云端 */
  onKeepLocal: () => void
  onExport: () => void
  onImport: () => void
}

const TITLE = 'm-0 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground'
const NOTE = 'm-0 text-[12px] leading-relaxed text-muted-foreground'
const ERROR = 'm-0 text-[12px] leading-relaxed text-destructive'

/** 时间戳 → "10-16 10:32"。纯显示用，不进逻辑层。 */
function shortTime(ts: number | null): string {
  if (!ts) return '从未'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  'signed-out': '未登录，改动只存在这台浏览器里。',
  syncing: '正在和云端同步…',
  synced: '本机与云端一致。',
  pending: '有改动还没传上去，2 秒后会自动重试。',
  conflict: '云端和本机都改过，需要你选一边。',
  error: '同步出错，改动仍在本地，修复后会补传。',
}

export function SyncPanel({
  configured,
  email,
  status,
  lastSyncedAt,
  error,
  onSignIn,
  onSignUp,
  onSignOut,
  onSyncNow,
  onUseCloud,
  onKeepLocal,
  onExport,
  onImport,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [emailInput, setEmailInput] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formInfo, setFormInfo] = useState<string | null>(null)

  // 点完操作就收起面板：留着它盖在页面上，用户会怀疑到底生效没有
  const run = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError(null)
    setFormInfo(null)
    const result =
      mode === 'signin'
        ? await onSignIn(emailInput.trim(), password)
        : await onSignUp(emailInput.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setPassword('')
    if (result.info) setFormInfo(result.info)
  }

  const needsAttention = status === 'error' || status === 'conflict'
  const signedIn = email !== null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" aria-label="云端同步与导入导出" />}
      >
        {needsAttention ? '备份 !' : '备份'}
      </PopoverTrigger>

      {/* 描边与去阴影由 ui/popover.tsx 的默认值提供，这里只限定宽度 */}
      <PopoverContent align="end" className="w-80">
        <h2 className={TITLE}>云端同步</h2>

        {!configured ? (
          <p className={NOTE}>
            还没有配置 Supabase。在项目根目录建一个 <code>.env.local</code>，填上{' '}
            <code>VITE_SUPABASE_URL</code> 和 <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            ，重新构建后这里就能登录。在那之前，数据只存在这台浏览器里，请用下面的「导出」手动存一份。
          </p>
        ) : !signedIn ? (
          <>
            <p className={NOTE}>
              登录后，本机的记录会整份上传到你自己的 Supabase 项目；之后每次改动 2 秒后自动同步。本机 localStorage 仍是主存储，断网也能照常记账。
            </p>
            <form className="flex flex-col gap-1.5" onSubmit={handleSubmit}>
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="邮箱"
                aria-label="邮箱"
                value={emailInput}
                disabled={busy}
                onChange={(e) => setEmailInput(e.currentTarget.value)}
              />
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="密码（至少 6 位）"
                aria-label="密码"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
              {formError ? <p className={ERROR}>{formError}</p> : null}
              {formInfo ? <p className={NOTE}>{formInfo}</p> : null}
              <div className="flex items-center gap-1.5">
                <Button size="sm" type="submit" disabled={busy}>
                  {busy ? '请稍候…' : mode === 'signin' ? '登录' : '注册'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin')
                    setFormError(null)
                    setFormInfo(null)
                  }}
                >
                  {mode === 'signin' ? '还没有账号？注册' : '已有账号？登录'}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className={NOTE}>
              已登录：{email}
              <br />
              最近同步：{shortTime(lastSyncedAt)}
            </p>
            <p className={NOTE}>{STATUS_TEXT[status]}</p>
            {/* 冲突有自己的一段说明，别再重复一遍横幅里那句话 */}
            {error && status !== 'conflict' ? <p className={ERROR}>{error}</p> : null}

            {status === 'conflict' ? (
              <>
                <p className={NOTE}>
                  本机记了云端没有的改动，云端也有本机不知道的改动（多半来自另一台设备）。
                  选一边覆盖，另一边会被替换。
                </p>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={run(onUseCloud)}>
                    用云端覆盖本机
                  </Button>
                  <Button variant="outline" size="sm" onClick={run(onKeepLocal)}>
                    把本机推上去
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" onClick={run(onSyncNow)} disabled={status === 'syncing'}>
                  立即同步
                </Button>
                <Button variant="outline" size="sm" onClick={run(onSignOut)}>
                  退出登录
                </Button>
              </div>
            )}
          </>
        )}

        {/* 手动导出/导入和云端同步是同一件事（拿到一份不受网线影响的数据副本）的两种做法。
            云端挂了、账号丢了、想搬到别的工具，都还能靠这个 JSON。 */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
          <h2 className={TITLE}>手动</h2>
          <p className={NOTE}>导出一个 JSON 文件；导入会用文件里的记录整体替换现有记录。</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={run(onExport)}>
              导出
            </Button>
            <Button variant="outline" size="sm" onClick={run(onImport)}>
              导入
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
