import { Activity } from "lucide-react"

import { Ring } from "@/components/Ring"
import { useMetrics } from "@/stores/metrics"
import { defineWidget, type WidgetProps } from "@/widgets/sdk"
import { WidgetPanel } from "@/widgets/WidgetPanel"

function System(_: WidgetProps) {
  const cpu = useMetrics((s) => s.latest?.cpu)
  const ram = useMetrics((s) => s.latest?.mem.percent)
  const gpu = useMetrics((s) => s.latest?.gpus[0])
  const connected = useMetrics((s) => s.connected)

  const worst = Math.max(cpu ?? 0, ram ?? 0, gpu?.util ?? 0)
  const status = !connected ? { text: "Connecting", color: "bg-muted-foreground/40" }
    : worst >= 90 ? { text: "High load", color: "bg-[var(--bad)]" }
    : worst >= 75 ? { text: "Busy", color: "bg-[var(--warn)]" }
    : { text: "All good", color: "bg-[var(--ok)]" }

  return (
    <WidgetPanel
      icon={Activity}
      title="System"
      trailing={
        <span className="flex items-center gap-1.5">
          {status.text}
          <span className={`size-2 rounded-full ${status.color}`} />
        </span>
      }
    >
      <div className="flex h-full items-start justify-between px-0.5 pt-2">
        <Ring value={cpu ?? 0} color="var(--ring-cpu)" label="CPU" />
        <Ring value={ram ?? 0} color="var(--ring-ram)" label="RAM" />
        <Ring value={gpu?.util ?? 0} color="var(--ring-gpu)" label="GPU" text={gpu ? undefined : "—"} />
      </div>
    </WidgetPanel>
  )
}

export default defineWidget({
  id: "system",
  name: "System",
  description: "CPU, RAM and GPU at a glance.",
  icon: Activity,
  component: System,
  defaultSize: { w: 348, h: 200 },
  minSize: { w: 300, h: 180 },
  maxSize: { w: 520, h: 300 },
  addByDefault: true,
})
