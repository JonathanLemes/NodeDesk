import { LayoutGrid, Plus, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AppForm, emptyDraft } from "@/apps/apps/AppForm"
import type { DesktopAppProps } from "@/apps/sdk"
import { AppIcon } from "@/components/AppIcon"
import { STATUS_LABEL, StatusDot } from "@/components/StatusDot"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { resolveUrl } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useAppMutations, useApps, useDiscover } from "@/services/queries"
import type { AppCandidate, ServiceApp, ServiceAppView } from "@/types/api"
import { WindowToolbar } from "@/windows/context"

export default function AppsApp({ props }: DesktopAppProps) {
  const { data: apps, isLoading } = useApps()
  const { create, remove, action, update } = useAppMutations()
  const [tab, setTab] = useState<"mine" | "discover">(props.tab === "discover" ? "discover" : "mine")
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<(Omit<ServiceApp, "id" | "order"> & { id?: string }) | null>(null)
  const [removing, setRemoving] = useState<ServiceAppView | null>(null)
  const { data: candidates } = useDiscover(tab === "discover")
  const selected = typeof props.select === "string" ? props.select : null

  useEffect(() => {
    if (props.tab === "discover") setTab("discover")
  }, [props.tab])

  const filtered = useMemo(() => (apps ?? []).filter((a) => a.name.toLowerCase().includes(query.toLowerCase())), [apps, query])
  const groups = useMemo(() => {
    const m = new Map<string, ServiceAppView[]>()
    for (const a of filtered) m.set(a.category || "", [...(m.get(a.category || "") ?? []), a])
    return [...m.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
  }, [filtered])

  const open = (a: ServiceAppView) => a.url && window.open(resolveUrl(a.url), "_blank", "noopener")
  const controllable = (a: ServiceAppView) => a.containers.length > 0 || a.systemdUnits.length > 0

  const addCandidate = (c: AppCandidate) =>
    create.mutate({ name: prettify(c.name), type: "docker", containers: [c.name], url: c.url, icon: c.icon ?? "", category: c.category ?? c.project ?? "", favorite: false })
  const addAll = () => candidates?.forEach(addCandidate)

  return (
    <div className="flex h-full flex-col">
      <WindowToolbar>
        <LayoutGrid className="size-5 text-muted-foreground" />
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} size="sm" variant="outline">
          <ToggleGroupItem value="mine" className="px-3">My Apps</ToggleGroupItem>
          <ToggleGroupItem value="discover" className="px-3">Discover</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1" />
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-8 bg-muted/50 pl-8 text-[13px]" />
        </div>
        <Button size="sm" onClick={() => setDraft(emptyDraft())}><Plus data-icon="inline-start" />Add</Button>
      </WindowToolbar>

      {tab === "mine" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {!isLoading && (apps?.length ?? 0) === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon"><LayoutGrid /></EmptyMedia>
                <EmptyTitle>No apps yet</EmptyTitle>
                <EmptyDescription>Add the services you run at home: Docker containers, systemd services or plain links.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Button size="sm" onClick={() => setTab("discover")}>Discover containers</Button>
                <Button size="sm" variant="secondary" onClick={() => setDraft(emptyDraft())}>Add manually</Button>
              </EmptyContent>
            </Empty>
          ) : (
            groups.map(([cat, list]) => (
              <section key={cat} className="mb-6">
                {groups.length > 1 && <h3 className="mb-2 px-1 text-xs font-medium text-muted-foreground">{cat || "Apps"}</h3>}
                <div className="grid gap-x-2 gap-y-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
                  {list.map((a) => (
                    <ContextMenu key={a.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          onClick={() => open(a)}
                          onDoubleClick={() => !a.url && setDraft(a)}
                          className={cn("flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 outline-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-primary", selected === a.id && "bg-primary/10 ring-1 ring-primary/40")}
                        >
                          <div className="relative">
                            <AppIcon name={a.name} icon={a.icon} size={64} />
                            <StatusDot status={a.status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-background" />
                          </div>
                          <span className="max-w-full truncate text-[13px] font-medium">{a.name}</span>
                          <span className="-mt-1 text-[11px] text-muted-foreground">{STATUS_LABEL[a.status]}</span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="min-w-48">
                        {a.url && <ContextMenuItem onSelect={() => open(a)}>Open</ContextMenuItem>}
                        {controllable(a) && (
                          <>
                            {a.status === "running" || a.status === "partial"
                              ? <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "stop" })}>Stop</ContextMenuItem>
                              : <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "start" })}>Start</ContextMenuItem>}
                            <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "restart" })}>Restart</ContextMenuItem>
                            <ContextMenuSeparator />
                          </>
                        )}
                        <ContextMenuItem onSelect={() => update.mutate({ ...a, favorite: !a.favorite })}>{a.favorite ? "Remove from Dock" : "Keep in Dock"}</ContextMenuItem>
                        <ContextMenuItem onSelect={() => setDraft(a)}>Edit…</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant="destructive" onSelect={() => setRemoving(a)}>Remove…</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center px-2">
            <p className="flex-1 text-[13px] text-muted-foreground">Docker containers that are not part of an app yet.</p>
            {(candidates?.length ?? 0) > 1 && <Button size="sm" variant="secondary" onClick={addAll}>Add all</Button>}
          </div>
          {candidates?.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Everything is already added.</p>}
          <ul>
            {candidates?.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).map((c) => (
              <li key={c.name} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-foreground/[0.04]">
                <AppIcon name={c.name} icon={c.icon} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{prettify(c.name)}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.image}{c.url && ` · ${c.url.replace("{host}", "host")}`}</p>
                </div>
                <StatusDot status={c.state === "running" ? "running" : "stopped"} />
                <Button size="sm" variant="secondary" onClick={() => addCandidate(c)}>Add</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AppForm draft={draft} onClose={() => setDraft(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from NodeDesk. The container or service itself is not touched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove.mutate(removing.id)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** "home-assistant" -> "Home Assistant" */
function prettify(name: string): string {
  return name.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
