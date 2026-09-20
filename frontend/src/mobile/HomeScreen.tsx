import { Minus } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

import { dockApps } from "@/apps/registry"
import { AppIcon } from "@/components/AppIcon"
import { t } from "@/i18n"
import { resolveUrl } from "@/lib/format"
import { cn } from "@/lib/utils"
import { applyLayout, cellKey, useHomeLayout, type HomeLayout } from "@/mobile/layout"
import { useAppMutations, useApps } from "@/services/queries"
import { getWidget } from "@/widgets/registry"
import { launch } from "@/windows/launch"

const PAD = 16
const GAP = 12
const ROW_H = 98
const ICON = 62
const WIDGET_H = 144
const DOCK_IDS = ["apps", "files", "monitor", "settings"]

// Gesture timings, modelled on iOS: a press-and-hold lifts the icon and shows the action menu;
// moving the finger while still holding turns that into rearranging (jiggle mode).
const HOLD_MENU_MS = 450 // on an icon: action menu
const HOLD_EDIT_MS = 550 // on empty space: straight into edit mode
const MOVE_SLOP = 8 // px before a press counts as a swipe / drag
const MENU_DRAG_SLOP = 10 // px of movement after the menu opened that starts a drag
const EDGE_PX = 36
const EDGE_MS = 500

interface MenuItem { label: string; onSelect: () => void; destructive?: boolean }
interface Cell { key: string; label: string; icon: ReactNode; onClick: () => void; menu: MenuItem[] }

function Label({ children }: { children: ReactNode }) {
  return <span className="w-full truncate text-center text-[12px] leading-tight text-white [text-shadow:0_1px_3px_oklch(0_0_0/0.7)]">{children}</span>
}

function Widget({ id, w, h }: { id: string; w: number; h: number }) {
  const def = getWidget(id)
  if (!def) return null
  const C = def.component
  return (
    <div className="glass overflow-hidden rounded-[22px] text-foreground" style={{ width: w, height: h }}>
      <C instanceId={`mobile-${id}`} size={{ w, h }} settings={{}} editing={false} />
    </div>
  )
}

const jiggleDelay = (key: string) => `${-((key.length * 37 + key.charCodeAt(key.length - 1)) % 10) / 20}s`

/** iOS-style home: compact widgets, a 4-column icon grid in swipeable pages, and a dock. */
export function HomeScreen() {
  const { data: apps } = useApps()
  const { action } = useAppMutations()
  const [saved, save] = useHomeLayout()
  const [layout, setLayout] = useState<HomeLayout>(saved)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<{ key: string; rect: DOMRect } | null>(null)
  const [drag, setDrag] = useState<{ key: string; w: number; h: number } | null>(null)
  const [box, setBox] = useState({ w: 390, h: 560 })
  const [page, setPage] = useState(0)

  const area = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const suppressClick = useRef(false)
  const lockScroll = useRef(false)
  const gesture = useRef<{
    id: number; x0: number; y0: number; key: string | null; el: HTMLElement | null
    mode: "down" | "menu" | "drag"; timer?: number; edgeTimer?: number; edgeSide?: number
  } | null>(null)

  // Follow saved changes (first load, other devices) unless the user is mid-edit.
  useEffect(() => {
    if (!editing) setLayout(saved)
  }, [saved, editing])

  useEffect(() => {
    const el = area.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // While a drag is in progress the page must not scroll; touchmove has to be cancelled explicitly (iOS).
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (lockScroll.current && e.cancelable) e.preventDefault()
    }
    window.addEventListener("touchmove", block, { passive: false })
    return () => window.removeEventListener("touchmove", block)
  }, [])

  const cells = useMemo<Cell[]>(() => {
    const edit: MenuItem = { label: t("mobile.edit_home"), onSelect: () => setEditing(true) }
    const builtin: Cell[] = dockApps.map((a) => ({
      key: cellKey.app(a.id), label: a.title, icon: a.icon(ICON), onClick: () => launch(a.id),
      menu: [{ label: t("common.open"), onSelect: () => launch(a.id) }, edit],
    }))
    const services: Cell[] = (apps ?? []).map((a) => {
      const controllable = a.containers.length > 0 || a.systemdUnits.length > 0
      const open = () => (a.url ? window.open(resolveUrl(a.url), "_blank", "noopener") : launch("apps", { select: a.id }))
      const items: MenuItem[] = [{ label: a.url ? t("app.open_new_tab") : t("app.show_in_apps"), onSelect: open }]
      if (controllable) {
        items.push(
          a.status === "running" || a.status === "partial"
            ? { label: t("action.stop"), onSelect: () => action.mutate({ id: a.id, action: "stop" }) }
            : { label: t("action.start"), onSelect: () => action.mutate({ id: a.id, action: "start" }) },
          { label: t("action.restart"), onSelect: () => action.mutate({ id: a.id, action: "restart" }) },
        )
      }
      items.push({ label: t("app.show_in_apps"), onSelect: () => launch("apps", { select: a.id }) }, edit)
      return { key: cellKey.service(a.id), label: a.name, icon: <AppIcon name={a.name} icon={a.icon} size={ICON} />, onClick: open, menu: items }
    })
    return [...builtin, ...services]
  }, [apps, action])

  const visible = useMemo(() => applyLayout(cells, layout), [cells, layout])
  const cellByKey = (key: string) => visible.find((c) => c.key === key) ?? cells.find((c) => c.key === key)

  // Pagination: how many icon rows fit under the widgets on page 1, and on later pages.
  const widgetW = Math.floor((box.w - PAD * 2 - GAP) / 2)
  const rows1 = Math.max(2, Math.floor((box.h - WIDGET_H - GAP * 2) / ROW_H))
  const cap1 = rows1 * 4 - 4 // the Services widget occupies a 2x2 block
  const capN = Math.max(1, Math.floor(box.h / ROW_H)) * 4
  const pages: Cell[][] = [visible.slice(0, cap1)]
  for (let i = cap1; i < visible.length; i += capN) pages.push(visible.slice(i, i + capN))

  const dock = DOCK_IDS.map((id) => dockApps.find((a) => a.id === id)).filter((a) => !!a)

  // ------------------------------------------------------------------ layout edits
  const commit = (next: HomeLayout, immediate = false) => {
    setLayout(next)
    save(next, immediate)
  }
  const orderNow = () => visible.map((c) => c.key)
  const hide = (key: string) => commit({ order: orderNow().filter((k) => k !== key), hidden: [...layout.hidden.filter((k) => k !== key), key] }, true)
  const moveBefore = (key: string, overKey: string) => {
    const order = orderNow()
    const from = order.indexOf(key)
    const to = order.indexOf(overKey)
    if (from < 0 || to < 0 || from === to) return
    order.splice(from, 1)
    order.splice(to, 0, key)
    commit({ order, hidden: layout.hidden })
  }

  const goToPage = (p: number) => {
    const el = area.current
    if (el) el.scrollTo({ left: Math.max(0, Math.min(pages.length - 1, p)) * el.clientWidth, behavior: "smooth" })
  }

  const enterEdit = () => {
    navigator.vibrate?.(12)
    setMenu(null)
    setEditing(true)
  }

  // ---------------------------------------------------------------- gestures
  const clearTimers = (g: NonNullable<typeof gesture.current>) => {
    window.clearTimeout(g.timer)
    window.clearTimeout(g.edgeTimer)
  }

  const startDrag = (g: NonNullable<typeof gesture.current>, e: ReactPointerEvent) => {
    const rect = g.el!.getBoundingClientRect()
    g.mode = "drag"
    suppressClick.current = true
    lockScroll.current = true
    setMenu(null)
    setEditing(true)
    try {
      area.current?.setPointerCapture(e.pointerId) // survive the DOM reshuffle while reordering
    } catch {
      /* pointer already gone */
    }
    pos.current = { x: e.clientX, y: e.clientY, ox: e.clientX - rect.left, oy: e.clientY - rect.top }
    setDrag({ key: g.key!, w: rect.width, h: rect.height })
  }

  useLayoutEffect(() => {
    if (drag && overlay.current) overlay.current.style.transform = `translate(${pos.current.x - pos.current.ox}px, ${pos.current.y - pos.current.oy}px) scale(1.12)`
  }, [drag])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    if ((e.target as HTMLElement).closest("[data-badge]")) return
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell-key]")
    if (gesture.current) clearTimers(gesture.current)
    suppressClick.current = false
    const g: NonNullable<typeof gesture.current> = { id: e.pointerId, x0: e.clientX, y0: e.clientY, key: el?.dataset.cellKey ?? null, el, mode: "down" }
    gesture.current = g
    if (editing) return // drags start on movement; empty space just swipes pages
    g.timer = window.setTimeout(() => {
      if (gesture.current !== g || g.mode !== "down") return
      if (el && g.key) {
        navigator.vibrate?.(10)
        g.mode = "menu"
        suppressClick.current = true
        setMenu({ key: g.key, rect: el.getBoundingClientRect() })
      } else {
        enterEdit()
        gesture.current = null
      }
    }, el ? HOLD_MENU_MS : HOLD_EDIT_MS)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dist = Math.hypot(e.clientX - g.x0, e.clientY - g.y0)
    if (g.mode === "down" && dist > MOVE_SLOP) {
      window.clearTimeout(g.timer)
      if (editing && g.key) startDrag(g, e)
      else gesture.current = null // a swipe: let the page scroll
    } else if (g.mode === "menu" && dist > MENU_DRAG_SLOP) {
      startDrag(g, e) // still holding after the menu opened: this is a rearrange, close the menu
    } else if (g.mode === "drag") {
      pos.current.x = e.clientX
      pos.current.y = e.clientY
      if (overlay.current) overlay.current.style.transform = `translate(${e.clientX - pos.current.ox}px, ${e.clientY - pos.current.oy}px) scale(1.12)`

      // Swap with the icon under the finger (inner area only, so it does not flicker at borders).
      const over = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n instanceof HTMLElement && n.dataset.cellKey && n.dataset.cellKey !== g.key) as HTMLElement | undefined
      if (over?.dataset.cellKey) {
        const r = over.getBoundingClientRect()
        const inner = Math.abs(e.clientX - (r.left + r.width / 2)) < r.width * 0.3 && Math.abs(e.clientY - (r.top + r.height / 2)) < r.height * 0.3
        if (inner && g.key) moveBefore(g.key, over.dataset.cellKey)
      }

      // Hold near a screen edge to flip pages while dragging.
      const side = e.clientX < EDGE_PX ? -1 : e.clientX > window.innerWidth - EDGE_PX ? 1 : 0
      if (side !== g.edgeSide) {
        window.clearTimeout(g.edgeTimer)
        g.edgeSide = side
        if (side !== 0) {
          g.edgeTimer = window.setTimeout(() => {
            goToPage(page + side)
            g.edgeSide = undefined
          }, EDGE_MS)
        }
      }
    }
  }

  const endGesture = () => {
    const g = gesture.current
    if (!g) return
    clearTimers(g)
    if (g.mode === "drag") {
      setDrag(null)
      lockScroll.current = false
      save(layout, true)
    }
    // A menu stays open after the finger lifts; the gesture itself is over.
    gesture.current = null
  }

  useEffect(() => () => {
    if (gesture.current) clearTimers(gesture.current)
  }, [])

  const menuCell = menu ? cellByKey(menu.key) : null
  const draggedCell = drag ? cellByKey(drag.key) : null

  const renderIcon = (c: Cell) => {
    const isDragged = drag?.key === c.key
    return (
      <div key={c.key} data-cell-key={c.key} className="relative" style={{ touchAction: editing ? "none" : undefined }}>
        <button
          onClick={() => {
            if (suppressClick.current) return void (suppressClick.current = false)
            if (!editing) c.onClick()
          }}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 outline-none select-none [-webkit-touch-callout:none]",
            !editing && "active:scale-95 active:opacity-80",
            editing && !isDragged && "animate-[jiggle_0.26s_ease-in-out_infinite_alternate]",
            isDragged && "opacity-0",
          )}
          style={{ transition: "transform .12s", animationDelay: editing ? jiggleDelay(c.key) : undefined }}
        >
          <div style={{ filter: "drop-shadow(0 3px 6px oklch(0.2 0.03 265 / 0.35))" }}>{c.icon}</div>
          <Label>{c.label}</Label>
        </button>
        {editing && !isDragged && (
          <button
            data-badge
            aria-label={t("mobile.remove_from_home")}
            onClick={() => hide(c.key)}
            className="absolute top-0 left-1.5 grid size-6 place-items-center rounded-full bg-black/65 text-white shadow ring-1 ring-white/30"
          >
            <Minus className="size-4" strokeWidth={3} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 flex flex-col"
      // Room under the status bar; in edit mode the "Done" pill lives in this strip (no layout shift).
      style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 36px)" }}
    >
      {editing && (
        <button
          onClick={() => {
            setEditing(false)
            save(layout, true)
          }}
          className="glass-strong fixed right-4 z-30 rounded-full px-4 py-1 text-[14px] font-semibold text-foreground"
          style={{ top: "calc(max(env(safe-area-inset-top), 20px) + 2px)" }}
        >
          {t("mobile.done")}
        </button>
      )}

      <div
        ref={area}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onContextMenu={(e) => e.preventDefault()}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden select-none [-webkit-touch-callout:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((items, p) => (
          <section key={p} className="h-full w-full shrink-0 snap-start" style={{ padding: `${p === 0 ? 0 : 4}px ${PAD}px 0` }}>
            {p === 0 && (
              <div className="flex justify-between" style={{ height: WIDGET_H, marginBottom: GAP }}>
                <Widget id="system" w={widgetW} h={WIDGET_H} />
                <Widget id="storage" w={widgetW} h={WIDGET_H} />
              </div>
            )}
            <div className="grid grid-cols-4" style={{ gridAutoRows: ROW_H }}>
              {p === 0 && (
                <div className="col-span-2 row-span-2">
                  <Widget id="services" w={widgetW} h={ROW_H * 2 - 8} />
                </div>
              )}
              {items.map(renderIcon)}
            </div>
          </section>
        ))}
      </div>

      <div className="flex h-7 items-center justify-center gap-2">
        {pages.length > 1 && pages.map((_, i) => (
          <span key={i} className={i === page ? "size-2 rounded-full bg-white shadow" : "size-2 rounded-full bg-white/40"} />
        ))}
      </div>

      <div className="glass mx-3 grid grid-cols-4 rounded-[32px] px-2 pt-3 pb-2" style={{ marginBottom: "max(env(safe-area-inset-bottom), 22px)" }}>
        {dock.map((a) => (
          <button key={a.id} onClick={() => !editing && launch(a.id)} className="flex flex-col items-center gap-1.5 outline-none active:scale-95 active:opacity-80" style={{ transition: "transform .12s" }}>
            <div style={{ filter: "drop-shadow(0 2px 4px oklch(0.2 0.03 265 / 0.3))" }}>{a.icon(ICON)}</div>
            <span className="text-[12px] leading-tight text-foreground/85">{a.title}</span>
          </button>
        ))}
      </div>

      {/* The icon being dragged follows the finger above everything else. */}
      {drag && draggedCell && (
        <div ref={overlay} className="pointer-events-none fixed top-0 left-0 z-40" style={{ width: drag.w, height: drag.h, willChange: "transform" }}>
          <div className="flex w-full flex-col items-center gap-1.5 px-0.5 py-1" style={{ filter: "drop-shadow(0 10px 18px oklch(0 0 0 / 0.45))" }}>
            {draggedCell.icon}
            <Label>{draggedCell.label}</Label>
          </div>
        </div>
      )}

      {/* Long-press menu (iOS "quick actions"): dims the screen, lifts the icon, lists actions. */}
      {menu && menuCell && (
        <>
          <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[3px] animate-[fade-in_0.15s]" onPointerDown={() => setMenu(null)} />
          <div className="pointer-events-none fixed z-50 flex flex-col items-center gap-1.5 px-0.5 py-1" style={{ left: menu.rect.left, top: menu.rect.top, width: menu.rect.width, transform: "scale(1.1)" }}>
            <div style={{ filter: "drop-shadow(0 10px 18px oklch(0 0 0 / 0.45))" }}>{menuCell.icon}</div>
            <Label>{menuCell.label}</Label>
          </div>
          <MenuCard rect={menu.rect} items={menuCell.menu} onClose={() => setMenu(null)} />
        </>
      )}
    </div>
  )
}

function MenuCard({ rect, items, onClose }: { rect: DOMRect; items: MenuItem[]; onClose: () => void }) {
  const W = 232
  const itemH = 46
  const h = items.length * itemH
  const below = rect.bottom + 12 + h < window.innerHeight - 24
  const left = Math.max(12, Math.min(window.innerWidth - W - 12, rect.left + rect.width / 2 - W / 2))
  const top = below ? rect.bottom + 14 : Math.max(60, rect.top - 14 - h)
  return (
    <div className="glass-strong fixed z-50 overflow-hidden rounded-2xl text-foreground animate-[pop-in_0.16s_ease-out]" style={{ left, top, width: W }}>
      {items.map((it, i) => (
        <button
          key={it.label}
          onClick={() => {
            onClose()
            it.onSelect()
          }}
          className={cn("flex w-full items-center px-4 text-left text-[15px] active:bg-foreground/10", i > 0 && "border-t border-border/60", it.destructive && "text-destructive")}
          style={{ height: itemH }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
