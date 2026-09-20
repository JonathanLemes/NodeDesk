import { Activity, Cpu, Gauge, HardDrive, MemoryStick, Network, type LucideIcon } from "lucide-react"
import { useState } from "react"

import type { DesktopAppProps } from "@/apps/sdk"
import { AreaChart, Sparkline } from "@/components/Chart"
import { formatBytes, formatDuration, formatRate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useSystemInfo } from "@/services/queries"
import { useMetrics } from "@/stores/metrics"
import type { Sample } from "@/types/api"
import { WindowToolbar } from "@/windows/context"

type Section = "cpu" | "memory" | "gpu" | "network" | "disk"

interface Series { label: string; color: string; values: number[]; max?: number; format: (v: number) => string }

const pct = (v: number) => `${v.toFixed(0)}%`

function seriesFor(section: Section, h: Sample[]): Series[] {
  switch (section) {
    case "cpu": return [{ label: "Utilization", color: "var(--ring-cpu)", values: h.map((s) => s.cpu), max: 100, format: pct }]
    case "memory": return [{ label: "In use", color: "var(--ring-ram)", values: h.map((s) => s.mem.percent), max: 100, format: pct }]
    case "gpu": return [
      { label: "Utilization", color: "var(--ring-gpu)", values: h.map((s) => s.gpus[0]?.util ?? 0), max: 100, format: pct },
      { label: "VRAM", color: "oklch(0.72 0.17 340)", values: h.map((s) => (s.gpus[0]?.memTotal ? (s.gpus[0].memUsed / s.gpus[0].memTotal) * 100 : 0)), max: 100, format: pct },
    ]
    case "network": return [
      { label: "Download", color: "var(--ring-cpu)", values: h.map((s) => s.net.rx), format: formatRate },
      { label: "Upload", color: "oklch(0.75 0.16 70)", values: h.map((s) => s.net.tx), format: formatRate },
    ]
    case "disk": return [
      { label: "Read", color: "var(--ring-ram)", values: h.map((s) => s.disk.rx), format: formatRate },
      { label: "Write", color: "oklch(0.7 0.2 25)", values: h.map((s) => s.disk.tx), format: formatRate },
    ]
  }
}

const NAV: { id: Section; label: string; icon: LucideIcon; color: string }[] = [
  { id: "cpu", label: "CPU", icon: Cpu, color: "var(--ring-cpu)" },
  { id: "memory", label: "Memory", icon: MemoryStick, color: "var(--ring-ram)" },
  { id: "gpu", label: "GPU", icon: Gauge, color: "var(--ring-gpu)" },
  { id: "network", label: "Network", icon: Network, color: "oklch(0.75 0.16 70)" },
  { id: "disk", label: "Disk I/O", icon: HardDrive, color: "oklch(0.7 0.2 25)" },
]

function headline(section: Section, s: Sample | null): string {
  if (!s) return "—"
  switch (section) {
    case "cpu": return pct(s.cpu)
    case "memory": return pct(s.mem.percent)
    case "gpu": return s.gpus[0] ? pct(s.gpus[0].util) : "—"
    case "network": return `↓ ${formatRate(s.net.rx)}`
    case "disk": return `R ${formatRate(s.disk.rx)}`
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] font-medium tabular-nums">{value}</dd>
    </div>
  )
}

export default function MonitorApp(_: DesktopAppProps) {
  const history = useMetrics((s) => s.history)
  const latest = useMetrics((s) => s.latest)
  const { data: info } = useSystemInfo()
  const [section, setSection] = useState<Section>("cpu")
  const [span, setSpan] = useState(60)
  const gpu = latest?.gpus[0]

  const series = seriesFor(section, history)
  const current = NAV.find((n) => n.id === section)!
  const CurrentIcon = current.icon

  return (
    <div className="flex h-full">
      <WindowToolbar>
        <Activity className="size-5 text-muted-foreground" />
        <h2 className="text-[16px] font-semibold">Monitor</h2>
        <div className="flex-1" />
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {[60, 300].map((s) => (
            <button key={s} onClick={() => setSpan(s)} className={cn("rounded-md px-2.5 py-1", span === s ? "bg-background shadow-sm" : "text-muted-foreground")}>{s === 60 ? "1 min" : "5 min"}</button>
          ))}
        </div>
      </WindowToolbar>

      <nav className="w-[216px] shrink-0 overflow-y-auto border-r border-border/70 bg-sidebar p-2">
        {NAV.map((n) => {
          const s = seriesFor(n.id, history)[0]
          const active = n.id === section
          return (
            <button key={n.id} onClick={() => setSection(n.id)} className={cn("mb-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", active ? "bg-primary/12 ring-1 ring-primary/30" : "hover:bg-foreground/[0.05]")}>
              <div className="w-[68px] shrink-0 overflow-hidden rounded border border-border/70 bg-background/60 p-0.5">
                <Sparkline data={s.values} max={s.max} color={n.color} />
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium">{n.label}</p>
                <p className="truncate text-[11px] text-muted-foreground tabular-nums">{headline(n.id, latest)}</p>
              </div>
            </button>
          )
        })}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight"><CurrentIcon className="size-5" style={{ color: current.color }} />{current.label}</h3>
          <span className="max-w-[60%] truncate text-xs text-muted-foreground">
            {section === "cpu" && info?.cpuModel}
            {section === "memory" && info && `${formatBytes(info.memTotal)} installed`}
            {section === "gpu" && (gpu?.name ?? "No GPU detected")}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-border/70 p-3">
          <div className="h-[170px]"><AreaChart data={series[0].values} max={series[0].max} color={series[0].color} points={span} height={170} /></div>
          {series[1] && <div className="mt-2 h-[90px]"><AreaChart data={series[1].values} max={series[1].max} color={series[1].color} points={span} height={90} /></div>}
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            {series.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}: <b className="font-medium text-foreground tabular-nums">{s.format(s.values[s.values.length - 1] ?? 0)}</b></span>
            ))}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-4">
          {section === "cpu" && latest && <>
            <Stat label="Utilization" value={pct(latest.cpu)} />
            <Stat label="Load (1/5/15)" value={latest.load.map((l) => l.toFixed(2)).join("  ")} />
            <Stat label="Threads" value={String(info?.cores ?? latest.cores.length)} />
            <Stat label="Temperature" value={latest.cpuTemp !== undefined ? `${Math.round(latest.cpuTemp)}°C` : "—"} />
            <Stat label="Uptime" value={info ? formatDuration(info.uptime) : "—"} />
          </>}
          {section === "memory" && latest && <>
            <Stat label="In use" value={formatBytes(latest.mem.used)} />
            <Stat label="Total" value={formatBytes(latest.mem.total)} />
            <Stat label="Swap used" value={`${formatBytes(latest.swap.used)} / ${formatBytes(latest.swap.total)}`} />
          </>}
          {section === "gpu" && (gpu ? <>
            <Stat label="Utilization" value={pct(gpu.util)} />
            <Stat label="VRAM" value={`${formatBytes(gpu.memUsed)} / ${formatBytes(gpu.memTotal)}`} />
            <Stat label="Temperature" value={gpu.temp !== undefined ? `${Math.round(gpu.temp)}°C` : "—"} />
            <Stat label="Power" value={gpu.power !== undefined ? `${gpu.power.toFixed(0)} W` : "—"} />
          </> : <p className="col-span-4 text-sm text-muted-foreground">No supported GPU found. NodeDesk reads NVIDIA cards through NVML and AMD cards through sysfs.</p>)}
          {section === "network" && latest && <>
            <Stat label="Download" value={formatRate(latest.net.rx)} />
            <Stat label="Upload" value={formatRate(latest.net.tx)} />
            <Stat label="Addresses" value={info?.ips.join(", ") || "—"} />
          </>}
          {section === "disk" && latest && <>
            <Stat label="Read" value={formatRate(latest.disk.rx)} />
            <Stat label="Write" value={formatRate(latest.disk.tx)} />
            {Object.entries(latest.devices ?? {}).map(([n, t]) => <Stat key={n} label={n} value={`${formatRate(t.rx)} / ${formatRate(t.tx)}`} />)}
          </>}
        </dl>
      </main>
    </div>
  )
}
