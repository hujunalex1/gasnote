import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx'
import { BACKUP_KEEP } from '@/lib/backup.ts'

type Props = {
  /** 浏览器支不支持 File System Access（Safari / Firefox / iPhone 都不支持） */
  supported: boolean
  /** 已授权的目录名；null 表示自动备份没开 */
  dirName: string | null
  /** 目录句柄还在，但需要用户点一下重新授权 */
  needsPermission: boolean
  lastCopiedAt: number | null
  onEnable: () => void
  onDisable: () => void
  onBackupNow: () => void
  onExport: () => void
  onImport: () => void
}

const TITLE = 'm-0 font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground'
const NOTE = 'm-0 text-[12px] leading-relaxed text-muted-foreground'

/** 时间戳 → "10-16 10:32"。纯显示用，不进逻辑层。 */
function shortTime(ts: number | null): string {
  if (!ts) return '从未'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BackupPanel({
  supported,
  dirName,
  needsPermission,
  lastCopiedAt,
  onEnable,
  onDisable,
  onBackupNow,
  onExport,
  onImport,
}: Props) {
  const [open, setOpen] = useState(false)
  const enabled = dirName !== null

  // 点完操作就收起面板：留着它盖在页面上，用户会怀疑到底生效没有
  const run = (fn: () => void) => () => {
    fn()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" aria-label="备份与导入导出" />}
      >
        {needsPermission ? '备份 !' : '备份'}
      </PopoverTrigger>

      {/* 描边与去阴影由 ui/popover.tsx 的默认值提供，这里只限定宽度 */}
      <PopoverContent align="end" className="w-80">
        <h2 className={TITLE}>自动备份</h2>

        {!supported ? (
          <p className={NOTE}>
            这个浏览器不支持自动写盘（Safari、Firefox、iPhone 都不支持），没法自动备份。
            请用「导出」手动存一份，别指望它。
          </p>
        ) : needsPermission ? (
          <>
            <p className={NOTE}>
              备份目录「{dirName}」还在，但浏览器要你重新确认一次写入权限。
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={run(onBackupNow)}>
                恢复自动备份
              </Button>
              <Button variant="outline" size="sm" onClick={run(onDisable)}>
                关闭
              </Button>
            </div>
          </>
        ) : enabled ? (
          <>
            <p className={NOTE}>
              已开启 · 目录「{dirName}」
              <br />
              最近备份：{shortTime(lastCopiedAt)}
            </p>
            <p className={NOTE}>
              每次改动 2 秒后写入当天那份快照，保留最近 {BACKUP_KEEP} 份。
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={run(onBackupNow)}>
                立即备份
              </Button>
              <Button variant="outline" size="sm" onClick={run(onDisable)}>
                关闭自动备份
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={NOTE}>
              选一个目录，之后每次改动都会自动写入一份带日期的备份。
              把目录放进 iCloud Drive，就等于顺带存到了云上。
            </p>
            <p className={NOTE}>
              数据仍然只存在这台浏览器里，备份是单向的副本，不会反向同步。
            </p>
            <Button size="sm" onClick={run(onEnable)}>
              选择备份文件夹
            </Button>
          </>
        )}

        {/* 手动导出/导入和自动备份是同一件事（拿到一份数据副本）的两种做法，
            放在一起；也让顶栏从四个等重按钮减到两个。
            不支持自动写盘的浏览器上，这里就是唯一的备份手段。 */}
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
