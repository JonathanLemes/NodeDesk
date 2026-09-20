import { cn } from "@/lib/utils"

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

export const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  partial: "Partial",
  failed: "Failed",
  stopped: "Stopped",
  unknown: "—",
}
