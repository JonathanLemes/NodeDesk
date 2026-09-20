import { cn } from "@/lib/utils"

interface MeterProps {
  /** 0–100 */
  value: number
  /** CSS colour / gradient for the fill. */
  color?: string
  className?: string
  height?: number
}

export function Meter({ value, color = "var(--primary)", className, height = 6 }: MeterProps) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-[var(--ring-track)]", className)} style={{ height }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${v}%`, background: color, transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }}
      />
    </div>
  )
}

/** Colour a usage bar by how full it is. */
export function usageColor(percent: number): string {
  if (percent >= 90) return "linear-gradient(90deg, oklch(0.7 0.2 40), var(--bad))"
  if (percent >= 75) return "linear-gradient(90deg, oklch(0.82 0.15 85), var(--warn))"
  return "linear-gradient(90deg, oklch(0.7 0.16 250), var(--ring-cpu))"
}
