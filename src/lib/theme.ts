import type { StorageLike } from './store.ts'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'gasnote.theme'

export function readSavedTheme(storage: StorageLike): Theme | null {
  try {
    const value = storage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function saveTheme(storage: StorageLike, theme: Theme): void {
  try {
    storage.setItem(THEME_KEY, theme)
  } catch {
    /* 内存模式下存不住，本次会话内仍然可用 */
  }
}

export function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

/**
 * shadcn 的深色模式靠 <html> 上的 .dark 类切换（见 index.css 的 @custom-variant）。
 * theme 为 null 表示「跟随系统」。
 *
 * 切换的那一帧先挂上 .theme-switching 关掉所有过渡：
 * 不这样做的话，每个带 transition 的元素（按钮的 transition-all、柱子的
 * transition-colors）都会把颜色慢慢淡过去，慢的能差 1 秒才跟上。
 * 主题切换是瞬时状态变更，不该有动画。
 */
export function applyThemeClass(theme: Theme | null): void {
  const dark = theme ? theme === 'dark' : systemPrefersDark()
  const root = document.documentElement

  root.classList.add('theme-switching')
  root.classList.toggle('dark', dark)
  // 读一次布局属性，强制浏览器在移除 .theme-switching 之前先应用这一帧
  void root.offsetHeight
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
}
