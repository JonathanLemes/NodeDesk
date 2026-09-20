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
import { t } from "@/i18n"

type Section = "cpu" | "memory" | "gpu" | "network" | "disk"

interface Series { label: string; color: string; values: number[]; max?: number; format: (v: number) => string }

const pct = (v: number) => `${v.toFixed(0)}%`

function seriesFor(section: Section, h: Sample[]): Series[] {
  switch (section) {
    case "cpu": return [{ label: t("monitor.utilization"), color: "var(--ring-cpu)", values: h.map((s) => s.cpu), max: 100, format: pct }]
    case "memory": return [{ label: t("monitor.in_use"), color: "var(--ring-ram)", values: h.map((s) => s.mem.percent), max: 100, format: pct }]
    case "gpu": return [
      { label: t("monitor.utilization"), color: "var(--ring-gpu)", values: h.map((s) => s.gpus[0]?.util ?? 0), max: 100, format: pct },
      { label: "VRAM", color: "oklch(0.72 0.17 340)", values: h.map((s) => (s.gpus[0]?.memTotal ? (s.gpus[0].memUsed / s.gpus[0].memTotal) * 100 : 0)), max: 100, format: pct },
    ]
    case "network": return [
      { label: t("monitor.download"), color: "var(--ring-cpu)", values: h.map((s) => s.net.rx), format: formatRate },
      { label: t("monitor.upload"), color: "oklch(0.75 0.16 70)", values: h.map((s) => s.net.tx), format: formatRate },
    ]
    case "disk": return [
      { label: t("monitor.read"), color: "var(--ring-ram)", values: h.map((s) => s.disk.rx), format: formatRate },
      { label: t("monitor.write"), color: "oklch(0.7 0.2 25)", values: h.map((s) => s.disk.tx), format: formatRate },
    ]
  }
}

const NAV: { id: Section; label: string; icon: LucideIcon; color: string }[] = [
  { id: "cpu", label: "CPU", icon: Cpu, color: "var(--ring-cpu)" },
  { id: "memory", get label() { return t("monitor.memory") }, icon: MemoryStick, color: "var(--ring-ram)" },
  { id: "gpu", label: "GPU", icon: Gauge, color: "var(--ring-gpu)" },
  { id: "network", get label() { return t("menubar.network") }, icon: Network, color: "oklch(0.75 0.16 70)" },
  { id: "disk", get label() { return t("monitor.disk_io") }, icon: HardDrive, color: "oklch(0.7 0.2 25)" },
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
    <div className="flex h-full max-md:flex-col">
      <WindowToolbar>
        <Activity className="size-5 text-muted-foreground" />
        <h2 className="text-[16px] font-semibold">{t("app.monitor")}</h2>
        <div className="flex-1" />
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {[60, 300].map((s) => (
            <button key={s} onClick={() => setSpan(s)} className={cn("rounded-md px-2.5 py-1", span === s ? "bg-background shadow-sm" : "text-muted-foreground")}>{s === 60 ? t("monitor.span_1") : t("monitor.span_5")}</button>
          ))}
        </div>
      </WindowToolbar>

      <nav className="w-[216px] shrink-0 overflow-y-auto border-r border-border/70 bg-sidebar p-2 max-md:flex max-md:w-full max-md:overflow-x-auto max-md:overflow-y-hidden max-md:border-r-0 max-md:border-b">
        {NAV.map((n) => {
          const s = seriesFor(n.id, history)[0]
          const active = n.id === section
          return (
            <button key={n.id} onClick={() => setSection(n.id)} className={cn("mb-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left max-md:mb-0 max-md:w-auto max-md:shrink-0", active ? "bg-primary/12 ring-1 ring-primary/30" : "hover:bg-foreground/[0.05]")}>
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
            {section === "memory" && info && t("monitor.installed", { size: formatBytes(info.memTotal) })}
            {section === "gpu" && (gpu?.name ?? t("monitor.no_gpu"))}
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
            <Stat label={t("monitor.utilization")} value={pct(latest.cpu)} />
            <Stat label={t("monitor.load")} value={latest.load.map((l) => l.toFixed(2)).join("  ")} />
            <Stat label={t("monitor.threads")} value={String(info?.cores ?? latest.cores.length)} />
            <Stat label={t("monitor.temperature")} value={latest.cpuTemp !== undefined ? `${Math.round(latest.cpuTemp)}°C` : "—"} />
            <Stat label={t("about.uptime")} value={info ? formatDuration(info.uptime) : "—"} />
          </>}
          {section === "memory" && latest && <>
            <Stat label={t("monitor.in_use")} value={formatBytes(latest.mem.used)} />
            <Stat label={t("monitor.total")} value={formatBytes(latest.mem.total)} />
            <Stat label={t("monitor.swap")} value={`${formatBytes(latest.swap.used)} / ${formatBytes(latest.swap.total)}`} />
          </>}
          {section === "gpu" && (gpu ? <>
            <Stat label={t("monitor.utilization")} value={pct(gpu.util)} />
            <Stat label="VRAM" value={`${formatBytes(gpu.memUsed)} / ${formatBytes(gpu.memTotal)}`} />
            <Stat label={t("monitor.temperature")} value={gpu.temp !== undefined ? `${Math.round(gpu.temp)}°C` : "—"} />
            <Stat label={t("monitor.power")} value={gpu.power !== undefined ? `${gpu.power.toFixed(0)} W` : "—"} />
          </> : <p className="col-span-4 text-sm text-muted-foreground">{t("monitor.no_gpu_desc")}</p>)}
          {section === "network" && latest && <>
            <Stat label={t("monitor.download")} value={formatRate(latest.net.rx)} />
            <Stat label={t("monitor.upload")} value={formatRate(latest.net.tx)} />
            <Stat label={t("monitor.addresses")} value={info?.ips.join(", ") || "—"} />
          </>}
          {section === "disk" && latest && <>
            <Stat label={t("monitor.read")} value={formatRate(latest.disk.rx)} />
            <Stat label={t("monitor.write")} value={formatRate(latest.disk.tx)} />
            {Object.entries(latest.devices ?? {}).map(([n, io]) => <Stat key={n} label={n} value={`${formatRate(io.rx)} / ${formatRate(io.tx)}`} />)}
          </>}
        </dl>
      </main>
    </div>
  )
}
