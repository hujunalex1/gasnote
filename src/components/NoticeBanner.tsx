import { CORRUPT_KEY, type Notice } from '@/lib/store.ts'
import { cn } from 'cn'

type Props = {
  notice: Notice | null
  /** 落盘失败时的错误信息；优先级高于 notice，因为它意味着刚刚的写入没成功 */
  saveError: string | null
}

const CORRUPT_TAIL = `原始副本已原样保留在 localStorage 的 ${CORRUPT_KEY} 键下，没有被删除。注意：点「导出」导出的是当前列表，不包含这份副本。`

export function NoticeBanner({ notice, saveError }: Props) {
  if (!notice && !saveError) return null

  let text: string
  let severe = false
  if (saveError) {
    text = saveError
    severe = true
  } else if (notice!.kind === 'storage-unavailable') {
    text = '浏览器不允许保存数据（可能是无痕模式）。本次记录只在当前页面有效，刷新即丢。请点「导出」保存。'
  } else if (notice!.kind === 'corrupt-version') {
    text = `检测到本工具更新版本写入的数据，当前版本读不懂。${CORRUPT_TAIL}`
    severe = true
  } else {
    text = `本地数据已损坏，无法读取。${CORRUPT_TAIL}`
    severe = true
  }

  return (
    <div
      role="status"
      className={cn(
        'border px-3.5 py-3 text-sm leading-relaxed',
        severe
          ? 'border-destructive/60 bg-destructive/10 text-destructive'
          : 'border-primary/60 bg-primary/10 text-foreground',
      )}
    >
      {text}
    </div>
  )
}
