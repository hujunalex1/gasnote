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
 */
export function applyThemeClass(theme: Theme | null): void {
  const dark = theme ? theme === 'dark' : systemPrefersDark()
  document.documentElement.classList.toggle('dark', dark)
}
