import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import type { Theme } from '@/lib/theme.ts'

type Props = {
  /** 当前生效的是否深色（决定图标与可达性标签） */
  isDark: boolean
  onToggle: () => void
}

/**
 * 图标画的是「点一下会切到哪边」，不是「当前是哪边」——
 * 按钮上画状态是常见的歧义来源。没有文字，所以 aria-label 是唯一的名字。
 * 用 ghost 而不是带框按钮：它几乎不会被点，不该和「备份」一样重。
 */
export function ThemeToggle({ isDark, onToggle }: Props) {
  const label = isDark ? '切换到浅色模式' : '切换到深色模式'
  return (
    <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={label} title={label}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

export type { Theme }
