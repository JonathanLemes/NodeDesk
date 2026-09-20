import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HardDrive, RefreshCw, ScanSearch, ShieldCheck, ShieldAlert, Usb, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { DesktopAppProps } from "@/apps/sdk"
import { Meter, usageColor } from "@/components/Meter"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatBytes, formatCapacity, formatDate, formatRate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { errorMessage, keys, storageApi, useSmart, useStorage } from "@/services/queries"
import { useMetrics } from "@/stores/metrics"
import type { Disk, Partition, Usage } from "@/types/api"
import { WindowToolbar } from "@/windows/context"
import { locale, t, type MessageKey } from "@/i18n"

type Analyze = (path: string, force?: boolean) => void

const kindLabel = (k: string): string =>
  ({ nvme: "NVMe SSD", ssd: "SSD", hdd: t("storage.kind_hdd"), usb: "USB", virtual: t("storage.kind_virtual") })[k] ?? k

function SmartButton({ disk }: { disk: string }) {
  const [open, setOpen] = useState(false)
  const { data, isFetching } = useSmart(open ? disk : null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="xs" variant="ghost">{t("storage.health")}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1.5 text-[13px]">
        <p className="font-semibold">SMART · {disk}</p>
        {isFetching && <p className="text-muted-foreground">{t("storage.reading")}</p>}
        {data && !data.available && <p className="text-muted-foreground">{data.reason ? t(`storage.reason_${data.reason}` as MessageKey) : t("storage.unavailable")}</p>}
        {data?.available && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("storage.smart_status")}</dt>
            <dd className="flex items-center gap-1">{data.passed ? <><ShieldCheck className="size-3.5 text-[var(--ok)]" />{t("storage.passed")}</> : <><ShieldAlert className="size-3.5 text-destructive" />{t("storage.failing")}</>}</dd>
            {data.temperature !== undefined && <><dt className="text-muted-foreground">{t("monitor.temperature")}</dt><dd>{data.temperature}°C</dd></>}
            {data.powerOnHours !== undefined && <><dt className="text-muted-foreground">{t("storage.power_on")}</dt><dd>{data.powerOnHours.toLocaleString(locale())} h</dd></>}
            {data.reallocated !== undefined && <><dt className="text-muted-foreground">{t("storage.reallocated")}</dt><dd>{data.reallocated}</dd></>}
            {data.percentUsed !== undefined && <><dt className="text-muted-foreground">{t("storage.wear")}</dt><dd>{data.percentUsed}%</dd></>}
          </dl>
        )}
      </PopoverContent>
    </Popover>
  )
}

function DiskBlock({ disk, onAnalyze }: { disk: Disk; onAnalyze: Analyze }) {
  const io = useMetrics((s) => s.latest?.devices?.[disk.name])
  return (
    <section className="mb-5">
      <header className="flex items-center gap-3 px-4 py-2">
        {disk.kind === "usb" ? <Usb className="size-8 text-muted-foreground" strokeWidth={1.2} /> : <HardDrive className="size-8 text-muted-foreground" strokeWidth={1.2} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{disk.model || disk.name} <span className="font-normal text-muted-foreground">· {disk.name}</span></p>
          <p className="text-xs text-muted-foreground">
            {formatCapacity(disk.size)} · {kindLabel(disk.kind)}
            {disk.temp !== undefined && ` · ${Math.round(disk.temp)}°C`}
          </p>
        </div>
        <div className="text-right text-[11.5px] leading-tight text-muted-foreground tabular-nums">
          <p>R {formatRate(io?.rx ?? 0)}</p>
          <p>W {formatRate(io?.tx ?? 0)}</p>
        </div>
        <SmartButton disk={disk.name} />
      </header>
      <div className="mx-3 rounded-xl border border-border/70">
        {disk.partitions.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">{t("storage.no_partitions")}</p>}
        {disk.partitions.map((p, i) => <PartitionRow key={p.name} p={p} first={i === 0} onAnalyze={onAnalyze} />)}
      </div>
    </section>
  )
}

function PartitionRow({ p, first, onAnalyze }: { p: Partition; first: boolean; onAnalyze: Analyze }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5", !first && "border-t border-border/70")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13.5px] font-medium">{p.label || (p.mountpoint === "/" ? t("storage.system") : p.mountpoint) || p.name}</span>
          <span className="truncate text-[11.5px] text-muted-foreground">{p.mounted ? p.mountpoint : t("storage.not_mounted")} · {p.fsType || t("storage.unknown_fs")}{p.readOnly && ` · ${t("common.read_only").toLowerCase()}`}</span>
        </div>
        {p.mounted ? (
          <div className="mt-1.5 flex items-center gap-3">
            <Meter value={p.percent} color={usageColor(p.percent)} className="flex-1" />
            <span className="w-40 shrink-0 text-right text-[11.5px] text-muted-foreground tabular-nums">{t("upload.progress", { loaded: formatBytes(p.used), total: formatBytes(p.used + p.free) })} · {Math.round(p.percent)}%</span>
          </div>
        ) : (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{formatBytes(p.size)}</p>
        )}
      </div>
      {p.mounted && p.mountpoint && (
        <Button size="xs" variant="secondary" onClick={() => onAnalyze(p.mountpoint!)}><ScanSearch data-icon="inline-start" />{t("storage.analyze")}</Button>
      )}
    </div>
  )
}

function AnalysisPanel({ id, onClose, onAnalyze }: { id: string; onClose: () => void; onAnalyze: Analyze }) {
  const { data: a } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => storageApi.get(id),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1000 : false),
  })
  if (!a) return null
  const max = Math.max(1, ...a.children.map((c) => c.size))
  const Row = ({ u }: { u: Usage }) => (
    <li>
      <button
        disabled={!u.isDir || a.status === "running"}
        onClick={() => onAnalyze(u.path)}
        className="group w-full rounded-md px-2 py-1 text-left enabled:hover:bg-foreground/[0.05]"
      >
        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="truncate">{u.isDir ? "📁 " : ""}{u.name}</span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{formatBytes(u.size)}</span>
        </div>
        <Meter value={(u.size / max) * 100} height={4} className="mt-1" />
      </button>
    </li>
  )
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-border/70 animate-[fade-in_0.15s]">
      <div className="flex items-start gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold">{t("storage.usage")}</h3>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{a.path}</p>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label={t("window.close")} onClick={onClose}><X /></Button>
      </div>
      <div className="px-4 pb-2 text-xs text-muted-foreground">
        {a.status === "running" && <p>{t("storage.scanning", { count: a.scanned.toLocaleString(locale()), size: formatBytes(a.bytes) })}</p>}
        {a.status === "done" && <p>{t("storage.scanned", { count: a.scanned.toLocaleString(locale()), size: formatBytes(a.bytes) })}{a.skipped > 0 && ` · ${t("storage.unreadable", { count: a.skipped })}`}{a.fromCache && ` · ${t("storage.cached", { time: formatDate(a.finished ?? a.started, { hour: "numeric", minute: "2-digit" }) })}`}</p>}
        {a.status === "failed" && <p className="text-destructive">{a.error}</p>}
        {a.status === "cancelled" && <p>{t("storage.cancelled")}</p>}
        <div className="mt-2 flex gap-2">
          {a.status === "running"
            ? <Button size="xs" variant="secondary" onClick={() => storageApi.cancel(a.id)}>{t("common.cancel")}</Button>
            : <Button size="xs" variant="secondary" onClick={() => onAnalyze(a.path, true)}>{t("storage.rescan")}</Button>}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {a.children.length > 0 && (
          <>
            <p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">{t("storage.in_folder")}</p>
            <ul>{a.children.map((u) => <Row key={u.path} u={u} />)}</ul>
          </>
        )}
        {a.largest.length > 0 && (
          <>
            <p className="px-2 pt-4 pb-1 text-[11px] font-medium text-muted-foreground">{t("storage.largest")}</p>
            <ul>{a.largest.slice(0, 12).map((u) => <Row key={u.path} u={{ ...u, name: u.path.replace(a.path, "").replace(/^\//, "") }} />)}</ul>
          </>
        )}
      </div>
    </aside>
  )
}

export default function StorageApp(_: DesktopAppProps) {
  const { data, isLoading, refetch, isFetching } = useStorage()
  const qc = useQueryClient()
  const [analysisId, setAnalysisId] = useState<string | null>(null)

  const analyze: Analyze = async (path, force = false) => {
    try {
      const a = await storageApi.analyze(path, force)
      qc.setQueryData(["analysis", a.id], a)
      setAnalysisId(a.id)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex h-full">
      <WindowToolbar>
        <h2 className="text-[16px] font-semibold">{t("app.storage")}</h2>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" aria-label={t("common.refresh")} onClick={() => { refetch(); qc.invalidateQueries({ queryKey: keys.storage }) }}><RefreshCw className={cn(isFetching && "animate-spin")} /></Button>
      </WindowToolbar>
      <div className="min-w-0 flex-1 overflow-y-auto py-3">
        {isLoading && <p className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
        {data?.disks.map((d) => <DiskBlock key={d.name} disk={d} onAnalyze={analyze} />)}
        {data && data.disks.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t("storage.no_disks")}</p>}
        <p className="px-6 pb-4 text-[11.5px] text-muted-foreground">{t("storage.footer")}</p>
      </div>
      {analysisId && <AnalysisPanel id={analysisId} onClose={() => setAnalysisId(null)} onAnalyze={analyze} />}
    </div>
  )
}
