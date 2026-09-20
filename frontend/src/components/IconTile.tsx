import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

interface IconTileProps {
  size?: number
  /** CSS background (usually a gradient). */
  background: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/** The rounded "app icon" tile used by the dock, launcher and widgets. */
export function IconTile({ size = 56, background, children, className, style }: IconTileProps) {
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center text-white select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.225,
        background,
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.35), inset 0 -1px 0 oklch(0 0 0 / 0.12), 0 0.5px 0 oklch(0 0 0 / 0.2)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}
