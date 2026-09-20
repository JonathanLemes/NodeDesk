import { Minus, Plus, X } from "lucide-react"
import { Suspense, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { getDesktopApp } from "@/apps/registry"
import { cn } from "@/lib/utils"
import { useWindows, type DesktopWindow, type Geometry } from "@/stores/windows"
import { WindowContext } from "@/windows/context"
import { ErrorBoundary } from "@/windows/ErrorBoundary"
import { DOCK_RESERVE, MENUBAR_HEIGHT, saveGeometry } from "@/windows/launch"
import { t } from "@/i18n"

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const HANDLES: { edge: Edge; className: string; cursor: string }[] = [
  { edge: "n", className: "top-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "s", className: "bottom-0 left-3 right-3 h-1.5", cursor: "ns-resize" },
  { edge: "e", className: "right-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "w", className: "left-0 top-3 bottom-3 w-1.5", cursor: "ew-resize" },
  { edge: "ne", className: "top-0 right-0 size-3", cursor: "nesw-resize" },
  { edge: "nw", className: "top-0 left-0 size-3", cursor: "nwse-resize" },
  { edge: "se", className: "bottom-0 right-0 size-3", cursor: "nwse-resize" },
  { edge: "sw", className: "bottom-0 left-0 size-3", cursor: "nesw-resize" },
]

const INTERACTIVE = "button, input, textarea, select, a, [role=combobox], [role=slider], [data-no-drag]"

function maximizedRect(): Geometry {
  return {
    x: 8,
    y: MENUBAR_HEIGHT + 6,
    w: window.innerWidth - 16,
    h: window.innerHeight - MENUBAR_HEIGHT - DOCK_RESERVE - 6,
  }
}

export function WindowFrame({ win }: { win: DesktopWindow }) {
  const app = getDesktopApp(win.appId)
  const focused = useWindows((s) => s.focusedId === win.id)
  const { focus, close, minimize, toggleMaximize, setGeometry } = useWindows.getState()
  const frame = useRef<HTMLDivElement>(null)
  const [titlebar, setTitlebar] = useState<HTMLElement | null>(null)
  const [animate, setAnimate] = useState(false)

  const geom: Geometry = win.maximized ? maximizedRect() : win
  const minSize = app?.minSize ?? { w: 360, h: 260 }

  const applyGeom = (g: Geometry) => {
    const el = frame.current
    if (!el) return
    el.style.left = `${g.x}px`
    el.style.top = `${g.y}px`
    el.style.width = `${g.w}px`
    el.style.height = `${g.h}px`
  }

  const commit = (g: Geometry) => {
    setGeometry(win.id, g)
    saveGeometry(win.appId, g)
  }

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return
    if (win.maximized) return
    const startX = e.clientX, startY = e.clientY
    const orig = { x: win.x, y: win.y }
    let last: Geometry = { ...win }
    const move = (ev: PointerEvent) => {
      const x = Math.max(80 - win.w, Math.min(window.innerWidth - 80, orig.x + ev.clientX - startX))
      const y = Math.max(MENUBAR_HEIGHT, Math.min(window.innerHeight - 40, orig.y + ev.clientY - startY))
      last = { x, y, w: win.w, h: win.h }
      applyGeom(last)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      if (last.x !== win.x || last.y !== win.y) commit(last)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const startResize = (edge: Edge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.maximized) return
    e.preventDefault()
    e.stopPropagation()
    focus(win.id)
    const sx = e.clientX, sy = e.clientY
    const o = { x: win.x, y: win.y, w: win.w, h: win.h }
    let last: Geometry = o
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      let { x, y, w, h } = o
      if (edge.includes("e")) w = Math.max(minSize.w, o.w + dx)
      if (edge.includes("s")) h = Math.max(minSize.h, o.h + dy)
      if (edge.includes("w")) { w = Math.max(minSize.w, o.w - dx); x = o.x + (o.w - w) }
      if (edge.includes("n")) { h = Math.max(minSize.h, o.h - dy); y = Math.max(MENUBAR_HEIGHT, o.y + (o.h - h)); h = o.y + o.h - y }
      last = { x, y, w, h }
      applyGeom(last)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      commit(last)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const zoom = useCallback(() => {
    setAnimate(true)
    toggleMaximize(win.id)
    window.setTimeout(() => setAnimate(false), 260)
  }, [toggleMaximize, win.id])

  if (!app) return null
  const Content = app.component

  return (
    <WindowContext.Provider value={{ windowId: win.id, titlebar, focused }}>
      <div
        ref={frame}
        data-focused={focused}
        onPointerDownCapture={() => focus(win.id)}
        className={cn(
          "window-shadow absolute flex flex-col overflow-hidden rounded-[14px] bg-window text-foreground",
          "animate-[window-in_0.18s_ease-out] transition-[opacity,transform] duration-200",
          animate && "transition-[left,top,width,height] duration-[240ms] ease-out",
          win.minimized && "pointer-events-none invisible translate-y-16 scale-90 opacity-0",
        )}
        style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h, zIndex: win.z }}
      >
        <div
          onPointerDown={startDrag}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest(INTERACTIVE)) zoom()
          }}
          className="group/titlebar relative flex h-[52px] shrink-0 items-center border-b border-border/70 bg-window select-none"
        >
          <div className="flex shrink-0 items-center gap-2 pr-3 pl-5" data-no-drag>
            <TrafficLight color="#ff5f57" label={t("window.close")} onClick={() => close(win.id)} focused={focused}><X strokeWidth={3} /></TrafficLight>
            <TrafficLight color="#febc2e" label={t("window.minimize")} onClick={() => minimize(win.id)} focused={focused}><Minus strokeWidth={3} /></TrafficLight>
            <TrafficLight color="#28c840" label={t("window.zoom")} onClick={zoom} focused={focused}><Plus strokeWidth={3} /></TrafficLight>
          </div>
          <div ref={setTitlebar} className="peer flex min-w-0 flex-1 items-center gap-2 pr-3" />
          <span className="pointer-events-none absolute inset-x-0 hidden text-center text-[13px] font-semibold text-foreground/85 peer-empty:block">
            {win.title ?? app.title}
          </span>
        </div>
        <div className="relative min-h-0 flex-1">
          <ErrorBoundary>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
              <Content windowId={win.id} props={win.props} />
            </Suspense>
          </ErrorBoundary>
        </div>

        {!win.maximized && HANDLES.map((h) => (
          <div key={h.edge} onPointerDown={startResize(h.edge)} className={cn("absolute z-10", h.className)} style={{ cursor: h.cursor }} />
        ))}
      </div>
    </WindowContext.Provider>
  )
}

function TrafficLight({ color, label, onClick, focused, children }: {
  color: string; label: string; onClick: () => void; focused: boolean; children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-[13px] place-items-center rounded-full text-black/60 transition-colors [&_svg]:size-[9px] [&_svg]:opacity-0 group-hover/titlebar:[&_svg]:opacity-100"
      style={{ background: focused ? color : "oklch(0.6 0 0 / 0.35)", boxShadow: "inset 0 0 0 0.5px oklch(0 0 0 / 0.2)" }}
    >
      {children}
    </button>
  )
}
