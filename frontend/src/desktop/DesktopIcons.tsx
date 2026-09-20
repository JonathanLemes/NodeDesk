import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { AppIcon } from "@/components/AppIcon"
import { StatusDot } from "@/components/StatusDot"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { resolveUrl } from "@/lib/format"
import { useAppMutations, useApps } from "@/services/queries"
import type { ServiceAppView } from "@/types/api"
import { launch, MENUBAR_HEIGHT } from "@/windows/launch"

const CELL_W = 104
const CELL_H = 112
const ICON = 60
const DRAG_THRESHOLD = 5

/** Default slots: columns from the right edge, below the watermark, filling downwards. */
function defaultSlot(index: number): { x: number; y: number } {
  const top = 200
  const rows = Math.max(1, Math.floor((window.innerHeight - top - 140) / CELL_H))
  const col = Math.floor(index / rows)
  const row = index % rows
  return { x: window.innerWidth - CELL_W - 24 - col * CELL_W, y: top + row * CELL_H }
}

const snap = (n: number, cell: number) => Math.round(n / cell) * cell

/** Apps pinned to the desktop. Click opens the app in a new tab; drag to rearrange. */
export function DesktopIcons() {
  const { data: apps } = useApps()
  const pinned = (apps ?? []).filter((a) => a.desktop)
  let unplaced = 0
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {pinned.map((a) => {
        const placed = a.desktopX >= 0 && a.desktopY >= 0
        const pos = placed ? { x: a.desktopX, y: a.desktopY } : defaultSlot(unplaced++)
        return <DesktopIcon key={a.id} app={a} x={pos.x} y={pos.y} />
      })}
    </div>
  )
}

function DesktopIcon({ app, x, y }: { app: ServiceAppView; x: number; y: number }) {
  const { move, update, action } = useAppMutations()
  const el = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const moved = useRef(false)

  // Keep icons reachable if the window shrank since they were placed.
  const cx = Math.max(0, Math.min(x, window.innerWidth - CELL_W))
  const cy = Math.max(MENUBAR_HEIGHT + 4, Math.min(y, window.innerHeight - CELL_H - 100))

  const open = () => (app.url ? window.open(resolveUrl(app.url), "_blank", "noopener") : launch("apps", { select: app.id }))
  const controllable = app.containers.length > 0 || app.systemdUnits.length > 0

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY
    let last = { x: cx, y: cy }
    moved.current = false
    const onMove = (ev: PointerEvent) => {
      if (!moved.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return
      moved.current = true
      setDragging(true)
      last = {
        x: Math.max(0, Math.min(window.innerWidth - CELL_W, cx + ev.clientX - sx)),
        y: Math.max(MENUBAR_HEIGHT + 4, Math.min(window.innerHeight - CELL_H - 100, cy + ev.clientY - sy)),
      }
      if (el.current) { el.current.style.left = `${last.x}px`; el.current.style.top = `${last.y}px` }
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setDragging(false)
      if (!moved.current) return
      const snapped = { x: snap(last.x, CELL_W / 2), y: snap(last.y, CELL_H / 2) }
      if (el.current) { el.current.style.left = `${snapped.x}px`; el.current.style.top = `${snapped.y}px` }
      move.mutate({ id: app.id, ...snapped }, { onSuccess: () => undefined })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={el}
          onPointerDown={onPointerDown}
          onClick={() => { if (!moved.current) open() }}
          className="group pointer-events-auto absolute flex cursor-default flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 select-none hover:bg-white/10 active:bg-white/15"
          style={{ left: cx, top: cy, width: CELL_W, opacity: dragging ? 0.85 : 1 }}
          title={app.url ? `Open ${app.name} in a new tab` : app.name}
        >
          <div className="relative" style={{ filter: "drop-shadow(0 3px 6px oklch(0.2 0.03 265 / 0.35))" }}>
            <AppIcon name={app.name} icon={app.icon} size={ICON} />
            {app.status !== "unknown" && <StatusDot status={app.status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-white/70" />}
          </div>
          <span className="line-clamp-2 max-w-full rounded px-1.5 text-center text-[12.5px] leading-tight font-medium text-white [text-shadow:0_1px_3px_oklch(0_0_0/0.6)]">
            {app.name}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem onSelect={open}>{app.url ? "Open in New Tab" : "Show in Apps"}</ContextMenuItem>
        {controllable && (
          <>
            <ContextMenuSeparator />
            {app.status === "running" || app.status === "partial"
              ? <ContextMenuItem onSelect={() => action.mutate({ id: app.id, action: "stop" })}>Stop</ContextMenuItem>
              : <ContextMenuItem onSelect={() => action.mutate({ id: app.id, action: "start" })}>Start</ContextMenuItem>}
            <ContextMenuItem onSelect={() => action.mutate({ id: app.id, action: "restart" })}>Restart</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => launch("apps", { select: app.id })}>Show in Apps</ContextMenuItem>
        <ContextMenuItem onSelect={() => update.mutate({ ...app, desktop: false })}>Remove from Desktop</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
