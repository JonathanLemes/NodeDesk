import { ChevronRight, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { t } from "@/i18n"
import { cn } from "@/lib/utils"

interface WidgetPanelProps {
  icon: LucideIcon
  title: string
  /** Shown on the right of the header, e.g. a status pill. */
  trailing?: ReactNode
  /** Makes the header a link (chevron) that runs this on click. */
  onOpen?: () => void
  /** Tighter padding and type for small (phone-sized) widgets. */
  compact?: boolean
  children: ReactNode
}

/** Standard widget chrome: icon + title header, then free-form content. */
export function WidgetPanel({ icon: Icon, title, trailing, onOpen, compact, children }: WidgetPanelProps) {
  return (
    <div className={cn("flex h-full flex-col", compact ? "px-3.5 pt-3 pb-3" : "px-5 pt-[18px] pb-4")}>
      <div className={cn("flex items-center", compact ? "mb-2 gap-2" : "mb-3 gap-3")}>
        <Icon className={cn("shrink-0 text-foreground/85", compact ? "size-5" : "size-[26px]")} strokeWidth={1.6} />
        <h3 className={cn("truncate font-semibold tracking-tight", compact ? "text-[14.5px]" : "text-[17px]")}>{title}</h3>
        <div className={cn("ml-auto flex shrink-0 items-center gap-2 text-muted-foreground", compact ? "text-[11px]" : "text-[13px]")}>
          {trailing}
          {onOpen && (
            <button
              onClick={onOpen}
              aria-label={t("widgets.open", { title })}
              className="-mr-1 rounded-md p-1 text-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground"
            >
              <ChevronRight className="size-[18px]" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
