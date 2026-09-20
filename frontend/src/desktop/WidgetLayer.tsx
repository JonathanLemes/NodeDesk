import { Check, Plus, Settings2, X } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/services/api"
import { useWidgetLayout } from "@/services/queries"
import { useUi } from "@/stores/ui"
import { useWidgetStore } from "@/stores/widgets"
import type { WidgetPlacement } from "@/types/api"
import { getWidget, widgetList } from "@/widgets/registry"
import { settingValue, type SettingField, type WidgetDefinition } from "@/widgets/sdk"
import { MENUBAR_HEIGHT } from "@/windows/launch"

const GRID = 8
const GAP = 16
const snap = (n: number) => Math.round(n / GRID) * GRID

function defaultLayout(): WidgetPlacement[] {
  let y = MENUBAR_HEIGHT + 30
  return widgetList
    .filter((d) => d.addByDefault)
    .map((d, i) => {
      const p: WidgetPlacement = { instanceId: `${d.id}-1`, widgetId: d.id, x: 32, y, w: d.defaultSize.w, h: d.defaultSize.h, z: i, settings: {} }
      y += d.defaultSize.h + GAP
      return p
    })
}

let saveTimer: number | undefined
function persist(placements: WidgetPlacement[]) {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    api.put("/api/widgets", { widgets: placements }).catch(() => {})
  }, 500)
}

/** Loads the layout from SQLite once, seeds defaults on a fresh install, and saves changes. */
function useLayoutSync() {
  const { data } = useWidgetLayout()
  const hydrate = useWidgetStore((s) => s.hydrate)
  const hydrated = useWidgetStore((s) => s.hydrated)
  useEffect(() => {
    if (!data || hydrated) return
    hydrate(data.initialized ? data.widgets : defaultLayout())
  }, [data, hydrated, hydrate])
  return hydrated
}

function nextFreeSpot(existing: WidgetPlacement[], def: WidgetDefinition): { x: number; y: number } {
  const bottom = Math.max(MENUBAR_HEIGHT + 30, ...existing.filter((p) => p.x < 400).map((p) => p.y + p.h + GAP))
  if (bottom + def.defaultSize.h < window.innerHeight - 130) return { x: 32, y: bottom }
  return { x: 32 + 20 * existing.length, y: MENUBAR_HEIGHT + 30 + 20 * existing.length }
}

export function WidgetLayer() {
  const hydrated = useLayoutSync()
  const placements = useWidgetStore((s) => s.placements)
  const editing = useUi((s) => s.editingWidgets)

  // Persist whenever the layout changes after hydration.
  const first = useRef(true)
  useEffect(() => {
    if (!hydrated) return
    if (first.current) {
      first.current = false
      return
    }
    persist(placements)
  }, [placements, hydrated])

  if (!hydrated) return null
  return (
    <div className="absolute inset-0 z-20">
      {placements.map((p) => <WidgetHost key={p.instanceId} placement={p} editing={editing} />)}
      {editing && <EditBar />}
      <WidgetGallery />
    </div>
  )
}

function WidgetHost({ placement, editing }: { placement: WidgetPlacement; editing: boolean }) {
  const def = getWidget(placement.widgetId)
  const update = useWidgetStore((s) => s.update)
  const remove = useWidgetStore((s) => s.remove)
  const bringToFront = useWidgetStore((s) => s.bringToFront)
  const el = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (!def) return null
  const Component = def.component

  // Keep widgets reachable when the window is smaller than the saved layout.
  const x = Math.max(0, Math.min(placement.x, window.innerWidth - 120))
  const y = Math.max(MENUBAR_HEIGHT + 4, Math.min(placement.y, window.innerHeight - 140))

  const startMove = (e: ReactPointerEvent) => {
    if (!editing || e.button !== 0) return
    if ((e.target as HTMLElement).closest("[data-widget-control]")) return
    e.preventDefault()
    bringToFront(placement.instanceId)
    const sx = e.clientX, sy = e.clientY
    let last = { x, y }
    const move = (ev: PointerEvent) => {
      last = {
        x: snap(Math.max(0, Math.min(window.innerWidth - 80, x + ev.clientX - sx))),
        y: snap(Math.max(MENUBAR_HEIGHT + 4, Math.min(window.innerHeight - 120, y + ev.clientY - sy))),
      }
      if (el.current) { el.current.style.left = `${last.x}px`; el.current.style.top = `${last.y}px` }
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      update(placement.instanceId, last)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const max = def.maxSize ?? { w: 800, h: 800 }
    let last = { w: placement.w, h: placement.h }
    const move = (ev: PointerEvent) => {
      last = {
        w: snap(Math.max(def.minSize.w, Math.min(max.w, placement.w + ev.clientX - sx))),
        h: snap(Math.max(def.minSize.h, Math.min(max.h, placement.h + ev.clientY - sy))),
      }
      if (el.current) { el.current.style.width = `${last.w}px`; el.current.style.height = `${last.h}px` }
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      update(placement.instanceId, last)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={el}
          onPointerDown={startMove}
          className={`glass absolute overflow-hidden rounded-[22px] text-foreground ${editing ? "cursor-grab ring-2 ring-primary/60 active:cursor-grabbing" : ""}`}
          style={{ left: x, top: y, width: placement.w, height: placement.h, zIndex: placement.z }}
        >
          <div className={editing ? "pointer-events-none h-full select-none" : "h-full"}>
            <Component instanceId={placement.instanceId} size={{ w: placement.w, h: placement.h }} settings={placement.settings} editing={editing} />
          </div>
          {editing && (
            <>
              <button
                data-widget-control aria-label="Remove widget"
                onClick={() => remove(placement.instanceId)}
                className="absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-foreground/70 text-background shadow"
              >
                <X className="size-3.5" />
              </button>
              {def.settings && def.settings.length > 0 && (
                <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <PopoverTrigger asChild>
                    <button data-widget-control aria-label="Widget settings" className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-foreground/70 text-background shadow">
                      <Settings2 className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 gap-3">
                    <p className="text-sm font-semibold">{def.name}</p>
                    {def.settings.map((f) => (
                      <FieldEditor key={f.key} field={f} settings={placement.settings}
                        onChange={(v) => update(placement.instanceId, { settings: { ...placement.settings, [f.key]: v } })} />
                    ))}
                  </PopoverContent>
                </Popover>
              )}
              <div data-widget-control onPointerDown={startResize} className="absolute right-0 bottom-0 size-6 cursor-nwse-resize">
                <div className="absolute right-1.5 bottom-1.5 size-2.5 rounded-br-md border-r-2 border-b-2 border-foreground/50" />
              </div>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => useUi.getState().setEditingWidgets(true)}>Edit Widgets</ContextMenuItem>
        <ContextMenuItem onSelect={() => useUi.getState().setWidgetGalleryOpen(true)}>Add Widget…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => remove(placement.instanceId)}>Remove “{def.name}”</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function FieldEditor({ field, settings, onChange }: { field: SettingField; settings: Record<string, unknown>; onChange: (v: unknown) => void }) {
  const value = settingValue<unknown>(settings, field)
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-[13px]">{field.label}</Label>
      {field.type === "toggle" && <Switch checked={value as boolean} onCheckedChange={onChange} />}
      {field.type === "number" && (
        <Input type="number" className="h-8 w-20" min={field.min} max={field.max} value={value as number}
          onChange={(e) => onChange(Math.max(field.min ?? 0, Math.min(field.max ?? 999, Number(e.target.value) || field.default)))} />
      )}
      {field.type === "select" && (
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      )}
    </div>
  )
}

function EditBar() {
  const setEditing = useUi((s) => s.setEditingWidgets)
  return (
    <div className="glass-strong fixed top-11 left-1/2 z-[8600] flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 text-[13px] animate-[pop-in_0.18s_ease-out]">
      <span className="text-muted-foreground">Drag to arrange · resize from the corner</span>
      <Button size="sm" variant="secondary" className="rounded-full" onClick={() => useUi.getState().setWidgetGalleryOpen(true)}>
        <Plus data-icon="inline-start" />Add
      </Button>
      <Button size="sm" className="rounded-full" onClick={() => setEditing(false)}>
        <Check data-icon="inline-start" />Done
      </Button>
    </div>
  )
}

function WidgetGallery() {
  const open = useUi((s) => s.widgetGalleryOpen)
  const setOpen = useUi((s) => s.setWidgetGalleryOpen)
  const placements = useWidgetStore((s) => s.placements)
  const add = useWidgetStore((s) => s.add)

  const addWidget = (def: WidgetDefinition) => {
    const spot = nextFreeSpot(placements, def)
    const n = placements.filter((p) => p.widgetId === def.id).length + 1
    add({
      instanceId: `${def.id}-${Date.now().toString(36)}${n}`, widgetId: def.id, ...spot,
      w: def.defaultSize.w, h: def.defaultSize.h, z: Math.max(0, ...placements.map((p) => p.z)) + 1, settings: {},
    })
    useUi.getState().setEditingWidgets(true)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>Widgets live on your desktop. Drop new ones into <code>src/widgets</code> to extend this list.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {widgetList.map((def) => {
            const Icon = def.icon
            return (
              <li key={def.id}>
                <button onClick={() => addWidget(def)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{def.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{def.description}</span>
                  </span>
                  <Plus className="size-4 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
