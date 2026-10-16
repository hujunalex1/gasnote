import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            // 刻意去掉了 shadcn 默认的进出场动画（animate-in/out + slide-in-*）。
            // Base UI 要等退场动画播完才卸载弹层，而这套 tw-animate-css 在本项目里
            // 不生效 —— 结果弹层被标记为 data-closed 却永远卡在屏幕上不消失。
            // 工业风本来也该是瞬时开合，不是渐隐。
            //
            // 也刻意去掉了 shadcn 默认的 shadow-md + ring-1，换成 1px 描边：
            // 本项目的分层手段就是细描边，不用投影（见 index.css 的说明）。
            // 所以调用方**不需要**再写 shadow-none ring-0 —— 那是重复的补丁。
            // 注意：将来 `npx shadcn@latest add popover --overwrite` 会把这两处
            // 改回来，重新拉取后必须重新应用。
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground outline-hidden",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
