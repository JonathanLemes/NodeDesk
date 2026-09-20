import { ChevronRight, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { t } from "@/i18n"

interface WidgetPanelProps {
  icon: LucideIcon
  title: string
  /** Shown on the right of the header, e.g. a status pill. */
  trailing?: ReactNode
  /** Makes the header a link (chevron) that runs this on click. */
  onOpen?: () => void
  children: ReactNode
}

/** Standard widget chrome: icon + title header, then free-form content. */
export function WidgetPanel({ icon: Icon, title, trailing, onOpen, children }: WidgetPanelProps) {
  return (
    <div className="flex h-full flex-col px-5 pt-[18px] pb-4">
      <div className="mb-3 flex items-center gap-3">
        <Icon className="size-[26px] shrink-0 text-foreground/85" strokeWidth={1.6} />
        <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
        <div className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
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
