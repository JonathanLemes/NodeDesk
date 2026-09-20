import { Activity } from "lucide-react"

import { Ring } from "@/components/Ring"
import { useMetrics } from "@/stores/metrics"
import { COMPACT_WIDTH, defineWidget, type WidgetProps } from "@/widgets/sdk"
import { WidgetPanel } from "@/widgets/WidgetPanel"
import { t } from "@/i18n"

function System({ size }: WidgetProps) {
  const compact = size.w < COMPACT_WIDTH
  const ring = compact ? Math.floor((size.w - 28 - 12) / 3) : 86
  const cpu = useMetrics((s) => s.latest?.cpu)
  const ram = useMetrics((s) => s.latest?.mem.percent)
  const gpu = useMetrics((s) => s.latest?.gpus[0])
  const connected = useMetrics((s) => s.connected)

  const worst = Math.max(cpu ?? 0, ram ?? 0, gpu?.util ?? 0)
  const status = !connected ? { text: t("system.connecting"), color: "bg-muted-foreground/40" }
    : worst >= 90 ? { text: t("system.high_load"), color: "bg-[var(--bad)]" }
    : worst >= 75 ? { text: t("system.busy"), color: "bg-[var(--warn)]" }
    : { text: t("system.all_good"), color: "bg-[var(--ok)]" }

  return (
    <WidgetPanel
      compact={compact}
      icon={Activity}
      title={t("widget.system.name")}
      trailing={
        <span className="flex items-center gap-1.5">
          {!compact && status.text}
          <span className={`size-2 rounded-full ${status.color}`} />
        </span>
      }
    >
      <div className="flex h-full items-start justify-between px-0.5 pt-1">
        <Ring size={ring} value={cpu ?? 0} color="var(--ring-cpu)" label="CPU" />
        <Ring size={ring} value={ram ?? 0} color="var(--ring-ram)" label="RAM" />
        <Ring size={ring} value={gpu?.util ?? 0} color="var(--ring-gpu)" label="GPU" text={gpu ? undefined : "—"} />
      </div>
    </WidgetPanel>
  )
}

export default defineWidget({
  id: "system",
  get name() {
    return t("widget.system.name")
  },
  get description() {
    return t("widget.system.desc")
  },
  icon: Activity,
  component: System,
  defaultSize: { w: 348, h: 200 },
  minSize: { w: 300, h: 180 },
  maxSize: { w: 520, h: 300 },
  addByDefault: true,
})
