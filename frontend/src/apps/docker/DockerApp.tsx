import { Container as ContainerIcon, Play, RefreshCw, RotateCw, Search, Square } from "lucide-react"
import { useMemo, useState } from "react"

import { LogViewer } from "@/apps/docker/LogViewer"
import type { DesktopAppProps } from "@/apps/sdk"
import { StatusDot } from "@/components/StatusDot"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatBytes, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useContainerAction, useContainers, useContainerStats, useDockerStatus, useImages } from "@/services/queries"
import { useWindows } from "@/stores/windows"
import type { Container, Port } from "@/types/api"
import { useWindowContext, WindowToolbar } from "@/windows/context"
import { t } from "@/i18n"

type Filter = "all" | "running" | "stopped"

const stateStatus = (c: Container) => (c.state === "running" ? (c.health === "unhealthy" ? "failed" : "running") : c.state === "restarting" ? "partial" : "stopped")

const portLabel = (p: Port) => (p.public ? `${p.public}→${p.private}` : `${p.private}`)
const portKey = (p: Port) => `${p.public ?? 0}-${p.private}-${p.type}`

export default function DockerApp(_: DesktopAppProps) {
  const { windowId } = useWindowContext()
  const minimized = useWindows((s) => !!s.windows.find((w) => w.id === windowId)?.minimized)
  const { data: status } = useDockerStatus()
  const { data: containers, isLoading, refetch, isFetching } = useContainers()
  const { data: stats } = useContainerStats(!minimized && !!status?.available)
  const action = useContainerAction()
  const [tab, setTab] = useState("containers")
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: images } = useImages(tab === "images")

  const list = useMemo(() => {
    const q = query.toLowerCase()
    return (containers ?? [])
      .filter((c) => (filter === "all" ? true : filter === "running" ? c.state === "running" : c.state !== "running"))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q))
      .sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.name.localeCompare(b.name))
  }, [containers, filter, query])
  const selected = containers?.find((c) => c.id === selectedId) ?? null
  const busy = (id: string) => action.isPending && action.variables?.id === id

  if (status && !status.available) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ContainerIcon /></EmptyMedia>
          <EmptyTitle>{t("docker.unavailable")}</EmptyTitle>
          <EmptyDescription>{status.error ?? t("docker.unreachable")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
      <WindowToolbar>
        <TabsList className="h-8">
          <TabsTrigger value="containers">{t("docker.containers")}</TabsTrigger>
          <TabsTrigger value="images">{t("docker.images")}</TabsTrigger>
        </TabsList>
        <span className="ml-2 hidden text-[12.5px] text-muted-foreground sm:inline">
          {status ? t("docker.summary", { running: status.running, total: status.total }) : ""}
        </span>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("docker.filter")} className="h-8 bg-muted/50 pl-8 text-[13px]" />
        </div>
        <Button variant="ghost" size="icon" aria-label={t("common.refresh")} onClick={() => refetch()}><RefreshCw className={cn(isFetching && "animate-spin")} /></Button>
      </WindowToolbar>

      <TabsContent value="containers" className="m-0 flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2">
            <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} size="sm" variant="outline">
              <ToggleGroupItem value="all" className="px-3">{t("docker.all")}</ToggleGroupItem>
              <ToggleGroupItem value="running" className="px-3">{t("status.running")}</ToggleGroupItem>
              <ToggleGroupItem value="stopped" className="px-3">{t("status.stopped")}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
            {!isLoading && list.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">{t("docker.no_match")}</p>}
            {list.map((c) => {
              const st = stats?.[c.id]
              const running = c.state === "running"
              const active = c.id === selectedId
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(active ? null : c.id)}
                  className={cn("group flex cursor-default items-center gap-3 rounded-lg px-3 py-2", active ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.04]")}
                >
                  <StatusDot status={stateStatus(c)} className={active ? "ring-2 ring-white/40" : ""} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{c.name}</p>
                    <p className={cn("truncate text-[11.5px]", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{c.image} · {c.status}</p>
                  </div>
                  <div className={cn("hidden max-w-[180px] flex-wrap justify-end gap-1 md:flex", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {c.ports.filter((p) => p.public).slice(0, 3).map((p) => <span key={portKey(p)} className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10.5px]">{portLabel(p)}</span>)}
                  </div>
                  <div className={cn("w-24 shrink-0 text-right text-[11.5px] tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {running && st ? <><p>{st.cpu.toFixed(1)}% CPU</p><p>{formatBytes(st.memUsed)}</p></> : null}
                  </div>
                  <div className="flex w-[84px] shrink-0 justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {running ? (
                      <>
                        <Button variant="ghost" size="icon-sm" disabled={busy(c.id)} aria-label={t("action.restart")} title={t("action.restart")} onClick={() => action.mutate({ id: c.id, action: "restart" })}><RotateCw className={cn(busy(c.id) && "animate-spin")} /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={busy(c.id)} aria-label={t("action.stop")} title={t("action.stop")} onClick={() => action.mutate({ id: c.id, action: "stop" })}><Square /></Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="icon-sm" disabled={busy(c.id)} aria-label={t("action.start")} title={t("action.start")} onClick={() => action.mutate({ id: c.id, action: "start" })}><Play /></Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selected && (
          <aside className="flex w-[340px] shrink-0 flex-col border-l border-border/70 p-4">
            <h3 className="truncate text-[15px] font-semibold">{selected.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{selected.image}</p>
            <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-[12.5px]">
              <dt className="text-muted-foreground">{t("docker.state")}</dt><dd>{selected.status}{selected.health && ` (${selected.health})`}</dd>
              <dt className="text-muted-foreground">{t("docker.created")}</dt><dd>{formatDate(selected.created * 1000)}</dd>
              {selected.project && <><dt className="text-muted-foreground">{t("docker.stack")}</dt><dd>{selected.project}</dd></>}
              {selected.ports.length > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("docker.ports")}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {selected.ports.map((p) => p.public
                      ? <a key={portKey(p)} className="font-mono text-primary hover:underline" target="_blank" rel="noopener noreferrer" href={`http://${location.hostname}:${p.public}`}>{portLabel(p)}/{p.type}</a>
                      : <span key={portKey(p)} className="font-mono text-muted-foreground">{p.private}/{p.type}</span>)}
                  </dd>
                </>
              )}
            </dl>
            {selected.mounts.length > 0 && (
              <div className="mt-3 max-h-28 overflow-y-auto rounded-lg bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">
                {selected.mounts.map((m) => (
                  <p key={m.destination} className="break-all"><span className="text-muted-foreground">{m.name ?? m.source}</span> → {m.destination}{!m.rw && <span className="text-muted-foreground"> (ro)</span>}</p>
                ))}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1">
              <LogViewer key={selected.id + selected.state} id={selected.id} running={selected.state === "running"} />
            </div>
          </aside>
        )}
      </TabsContent>

      <TabsContent value="images" className="m-0 min-h-0 flex-1 overflow-y-auto p-2">
        {(images ?? []).filter((im) => !query || im.tags.join(" ").toLowerCase().includes(query.toLowerCase())).map((im) => (
          <div key={im.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-foreground/[0.04]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium">{im.tags[0] ?? "<untagged>"}{im.tags.length > 1 && <span className="ml-1 text-xs text-muted-foreground">+{im.tags.length - 1}</span>}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{im.id}</p>
            </div>
            <span className="w-24 text-right text-xs text-muted-foreground">{im.containers > 0 ? t("docker.in_use", { count: im.containers }) : t("docker.unused")}</span>
            <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{formatBytes(im.size)}</span>
            <span className="w-24 text-right text-xs text-muted-foreground">{formatDate(im.created * 1000, { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        ))}
      </TabsContent>
    </Tabs>
  )
}
