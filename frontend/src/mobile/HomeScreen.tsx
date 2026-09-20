import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { dockApps } from "@/apps/registry"
import { AppIcon } from "@/components/AppIcon"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { t } from "@/i18n"
import { resolveUrl } from "@/lib/format"
import { useAppMutations, useApps } from "@/services/queries"
import { getWidget } from "@/widgets/registry"
import { launch } from "@/windows/launch"

const PAD = 16
const GAP = 12
const ROW_H = 98
const ICON = 62
const WIDGET_H = 144
const DOCK_IDS = ["apps", "files", "monitor", "settings"]

type Cell = { key: string; label: string; icon: ReactNode; onClick: () => void; menu?: ReactNode }

function HomeIcon({ cell }: { cell: Cell }) {
  const btn = (
    <button onClick={cell.onClick} className="flex w-full flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 outline-none active:scale-95 active:opacity-80" style={{ transition: "transform .12s" }}>
      <div style={{ filter: "drop-shadow(0 3px 6px oklch(0.2 0.03 265 / 0.35))" }}>{cell.icon}</div>
      <span className="w-full truncate text-center text-[12px] leading-tight text-white [text-shadow:0_1px_3px_oklch(0_0_0/0.7)]">{cell.label}</span>
    </button>
  )
  if (!cell.menu) return btn
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">{cell.menu}</ContextMenuContent>
    </ContextMenu>
  )
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

/** iOS-style home: compact widgets, a 4-column icon grid in swipeable pages, and a dock. */
export function HomeScreen() {
  const { data: apps } = useApps()
  const { action } = useAppMutations()
  const area = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 390, h: 560 })
  const [page, setPage] = useState(0)

  useEffect(() => {
    const el = area.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const cells = useMemo<Cell[]>(() => {
    const builtin: Cell[] = dockApps.map((a) => ({ key: `app-${a.id}`, label: a.title, icon: a.icon(ICON), onClick: () => launch(a.id) }))
    const services: Cell[] = (apps ?? []).map((a) => {
      const controllable = a.containers.length > 0 || a.systemdUnits.length > 0
      const open = () => (a.url ? window.open(resolveUrl(a.url), "_blank", "noopener") : launch("apps", { select: a.id }))
      return {
        key: `svc-${a.id}`, label: a.name, icon: <AppIcon name={a.name} icon={a.icon} size={ICON} />, onClick: open,
        menu: (
          <>
            <ContextMenuItem onSelect={open}>{a.url ? t("app.open_new_tab") : t("app.show_in_apps")}</ContextMenuItem>
            {controllable && (
              <>
                <ContextMenuSeparator />
                {a.status === "running" || a.status === "partial"
                  ? <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "stop" })}>{t("action.stop")}</ContextMenuItem>
                  : <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "start" })}>{t("action.start")}</ContextMenuItem>}
                <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "restart" })}>{t("action.restart")}</ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => launch("apps", { select: a.id })}>{t("app.show_in_apps")}</ContextMenuItem>
          </>
        ),
      }
    })
    return [...builtin, ...services]
  }, [apps, action])

  // Pagination: how many icon rows fit under the widgets on page 1, and on later pages.
  const widgetW = Math.floor((box.w - PAD * 2 - GAP) / 2)
  const rows1 = Math.max(2, Math.floor((box.h - WIDGET_H - GAP * 2) / ROW_H))
  const cap1 = rows1 * 4 - 4 // the Services widget occupies a 2x2 block
  const rowsN = Math.max(1, Math.floor(box.h / ROW_H))
  const capN = rowsN * 4
  const pages: Cell[][] = [cells.slice(0, cap1)]
  for (let i = cap1; i < cells.length; i += capN) pages.push(cells.slice(i, i + capN))

  const dock = DOCK_IDS.map((id) => dockApps.find((a) => a.id === id)).filter((a) => !!a)

  return (
    <div className="absolute inset-0 flex flex-col" style={{ paddingTop: "max(env(safe-area-inset-top), 14px)" }}>
      <div
        ref={area}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((items, p) => (
          <section key={p} className="h-full w-full shrink-0 snap-start" style={{ padding: `${p === 0 ? 0 : 4}px ${PAD}px 0` }}>
            {p === 0 && (
              <>
                <div className="flex justify-between" style={{ height: WIDGET_H, marginBottom: GAP }}>
                  <Widget id="system" w={widgetW} h={WIDGET_H} />
                  <Widget id="storage" w={widgetW} h={WIDGET_H} />
                </div>
                <div className="grid grid-cols-4" style={{ gridAutoRows: ROW_H }}>
                  <div className="col-span-2 row-span-2" style={{ paddingRight: 0 }}>
                    <Widget id="services" w={widgetW} h={ROW_H * 2 - 8} />
                  </div>
                  {items.map((c) => <HomeIcon key={c.key} cell={c} />)}
                </div>
              </>
            )}
            {p > 0 && (
              <div className="grid grid-cols-4" style={{ gridAutoRows: ROW_H }}>
                {items.map((c) => <HomeIcon key={c.key} cell={c} />)}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="flex h-7 items-center justify-center gap-2">
        {pages.length > 1 && pages.map((_, i) => (
          <span key={i} className={i === page ? "size-2 rounded-full bg-white shadow" : "size-2 rounded-full bg-white/40"} />
        ))}
      </div>

      <div
        className="glass mx-3 grid grid-cols-4 rounded-[32px] px-2 pt-3 pb-2"
        style={{ marginBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        {dock.map((a) => (
          <button key={a.id} onClick={() => launch(a.id)} className="flex flex-col items-center gap-1.5 outline-none active:scale-95 active:opacity-80" style={{ transition: "transform .12s" }}>
            <div style={{ filter: "drop-shadow(0 2px 4px oklch(0.2 0.03 265 / 0.3))" }}>{a.icon(ICON)}</div>
            <span className="text-[12px] leading-tight text-foreground/85">{a.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
