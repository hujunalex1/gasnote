import { useEffect } from 'react'
import { cn } from 'cn'

export type ToastMessage = {
  id: number
  text: string
  tone?: 'info' | 'error'
}

type Props = {
  toast: ToastMessage | null
  onDismiss: () => void
}

/** 轻量底部提示条，替代阻塞式的 window.alert。 */
export function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, toast.tone === 'error' ? 5000 : 3000)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div
        className={cn(
          'pointer-events-auto flex max-w-[540px] items-center gap-3 border px-3.5 py-2.5 text-sm leading-snug',
          toast.tone === 'error'
            ? 'border-destructive bg-card text-destructive'
            : 'border-border bg-card text-foreground',
        )}
      >
        <span className="whitespace-pre-line">{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="关闭提示"
          className="ml-auto shrink-0 cursor-pointer border-0 bg-transparent px-1 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          关闭
        </button>
      </div>
    </div>
  )
}
