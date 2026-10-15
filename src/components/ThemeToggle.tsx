import { Button } from '@/components/ui/button.tsx'
import type { Theme } from '@/lib/theme.ts'

type Props = {
  /** 当前生效的是否深色（决定按钮文案与可达性标签） */
  isDark: boolean
  onToggle: () => void
}

/**
 * 文案写的是「点一下会切到哪边」，不是「当前是哪边」——
 * 按钮上写状态是常见的歧义来源。
 */
export function ThemeToggle({ isDark, onToggle }: Props) {
  const label = isDark ? '切换到浅色模式' : '切换到深色模式'
  return (
    <Button variant="outline" size="sm" onClick={onToggle} aria-label={label} title={label}>
      {isDark ? '浅色' : '深色'}
    </Button>
  )
}

export type { Theme }
