import { cn } from "@/lib/utils"
import { t } from "@/i18n"

const COLORS: Record<string, string> = {
  running: "bg-[var(--ok)]",
  partial: "bg-[var(--warn)]",
  failed: "bg-[var(--bad)]",
  stopped: "bg-muted-foreground/40",
  unknown: "bg-muted-foreground/25",
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", COLORS[status] ?? COLORS.unknown, className)} />
}

/** Human label for an app / container status (resolved at call time so it follows the language). */
export function statusLabel(status: string): string {
  switch (status) {
    case "running": return t("status.running")
    case "partial": return t("status.partial")
    case "failed": return t("status.failed")
    case "stopped": return t("status.stopped")
    default: return "—"
  }
}
