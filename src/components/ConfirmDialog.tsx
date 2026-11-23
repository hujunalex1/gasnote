import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/button.tsx'

export type ConfirmRequest = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

type Props = {
  request: ConfirmRequest | null
  onClose: () => void
}

/**
 * 应用内确认弹窗，替代浏览器原生 window.confirm。
 * 保持与整站一致的工业风：直角、1px 细描边、无阴影、无退场动画。
 */
export function ConfirmDialog({ request, onClose }: Props) {
  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          data-slot="dialog-backdrop"
          className="fixed inset-0 z-50 bg-black/50"
        />
        <Dialog.Popup
          data-slot="dialog-popup"
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-5 text-card-foreground outline-none"
        >
          {request ? (
            <div className="flex flex-col gap-3.5">
              <Dialog.Title className="m-0 font-mono text-sm font-semibold tracking-[0.02em]">
                {request.title}
              </Dialog.Title>
              <Dialog.Description className="m-0 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {request.description}
              </Dialog.Description>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={onClose}>
                  {request.cancelLabel ?? '取消'}
                </Button>
                <Button
                  variant={request.destructive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => {
                    const action = request.onConfirm
                    onClose()
                    action()
                  }}
                >
                  {request.confirmLabel}
                </Button>
              </div>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
