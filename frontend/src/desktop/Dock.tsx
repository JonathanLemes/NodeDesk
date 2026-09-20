import { Trash2 } from "lucide-react"
import { useRef, type ReactNode } from "react"

import { AppIcon } from "@/components/AppIcon"
import { IconTile } from "@/components/IconTile"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { dockApps } from "@/apps/registry"
import { useSetting } from "@/hooks/useSetting"
import { resolveUrl } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useAppMutations, useApps } from "@/services/queries"
import { useWindows } from "@/stores/windows"
import { launch } from "@/windows/launch"
import { t } from "@/i18n"

interface DockItemProps {
  label: string
  icon: ReactNode
  active?: boolean
  running?: boolean
  onClick: () => void
  menu?: ReactNode
}

function DockItem({ label, icon, active, running, onClick, menu }: DockItemProps) {
  const button = (
    <button
      onClick={onClick}
      data-dock-item
      className="group/dock flex w-[84px] shrink-0 origin-bottom flex-col items-center gap-1 outline-none"
      style={{ transform: "scale(var(--dock-scale, 1))", transition: "transform 0.14s ease-out" }}
    >
      <div className="rounded-[14px] transition-transform duration-150 group-active/dock:scale-95 group-focus-visible/dock:ring-2 group-focus-visible/dock:ring-primary" style={{ filter: "drop-shadow(0 2px 4px oklch(0.2 0.03 265 / 0.3))" }}>
        {icon}
      </div>
      <span className={cn("max-w-full truncate text-[11.5px] leading-tight", active ? "font-medium text-primary" : "text-foreground/80")}>{label}</span>
      <span className={cn("-mt-0.5 size-[3px] rounded-full", running ? "bg-foreground/50" : "bg-transparent")} />
    </button>
  )
  if (!menu) return button
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">{menu}</ContextMenuContent>
    </ContextMenu>
  )
}

const Divider = () => <div className="mx-1.5 h-12 w-px self-center bg-foreground/15" />

export function Dock() {
  const windows = useWindows((s) => s.windows)
  const focusedId = useWindows((s) => s.focusedId)
  const { data: apps } = useApps()
  const [size] = useSetting("dock.size")
  const [magnify] = useSetting("dock.magnify")
  const { action, update } = useAppMutations()
  const ref = useRef<HTMLDivElement>(null)

  const focusedApp = windows.find((w) => w.id === focusedId && !w.minimized)?.appId
  const isRunning = (appId: string) => windows.some((w) => w.appId === appId)
  const favorites = (apps ?? []).filter((a) => a.favorite)

  // macOS-style magnification: scale each icon by its distance to the pointer.
  const onMove = (e: React.PointerEvent) => {
    if (!magnify || e.pointerType !== "mouse") return
    ref.current?.querySelectorAll<HTMLElement>("[data-dock-item]").forEach((el) => {
      const r = el.getBoundingClientRect()
      const d = Math.abs(e.clientX - (r.left + r.width / 2))
      el.style.setProperty("--dock-scale", String(1 + 0.22 * Math.exp(-((d / 70) ** 2))))
    })
  }
  const onLeave = () => ref.current?.querySelectorAll<HTMLElement>("[data-dock-item]").forEach((el) => el.style.removeProperty("--dock-scale"))

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[8000] flex justify-center">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="glass pointer-events-auto flex items-end gap-0.5 rounded-[26px] px-3 pt-2.5 pb-1.5"
      >
        {dockApps.map((app) => (
          <DockItem
            key={app.id}
            label={app.title}
            icon={app.icon(size)}
            active={focusedApp === app.id}
            running={isRunning(app.id)}
            onClick={() => launch(app.id)}
            menu={
              <>
                <ContextMenuItem onSelect={() => launch(app.id)}>{t("common.open")}</ContextMenuItem>
                {isRunning(app.id) && (
                  <ContextMenuItem onSelect={() => useWindows.getState().closeApp(app.id)}>{t("window.close")}</ContextMenuItem>
                )}
              </>
            }
          />
        ))}

        {favorites.length > 0 && <Divider />}
        {favorites.map((a) => (
          <DockItem
            key={a.id}
            label={a.name}
            icon={<AppIcon name={a.name} icon={a.icon} size={size} />}
            onClick={() => (a.url ? window.open(resolveUrl(a.url), "_blank", "noopener") : launch("apps", { select: a.id }))}
            menu={
              <>
                {a.url && <ContextMenuItem onSelect={() => window.open(resolveUrl(a.url), "_blank", "noopener")}>{t("common.open")}</ContextMenuItem>}
                <ContextMenuItem onSelect={() => launch("apps", { select: a.id })}>{t("app.show_in_apps")}</ContextMenuItem>
                {(a.containers.length > 0 || a.systemdUnits.length > 0) && (
                  <>
                    <ContextMenuSeparator />
                    {a.status === "running" ? (
                      <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "stop" })}>{t("action.stop")}</ContextMenuItem>
                    ) : (
                      <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "start" })}>{t("action.start")}</ContextMenuItem>
                    )}
                    <ContextMenuItem onSelect={() => action.mutate({ id: a.id, action: "restart" })}>{t("action.restart")}</ContextMenuItem>
                  </>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => update.mutate({ ...a, desktop: !a.desktop })}>{a.desktop ? t("app.remove_from_desktop") : t("app.add_to_desktop")}</ContextMenuItem>
                <ContextMenuItem onSelect={() => update.mutate({ ...a, favorite: false })}>{t("app.remove_from_dock")}</ContextMenuItem>
              </>
            }
          />
        ))}

        <Divider />
        <DockItem
          label={t("app.trash")}
          icon={
            <IconTile size={size} background="linear-gradient(160deg, oklch(0.95 0.005 265 / 0.9), oklch(0.8 0.01 265 / 0.9))" className="text-foreground/60">
              <Trash2 size={size * 0.5} strokeWidth={1.4} />
            </IconTile>
          }
          onClick={() => launch("files", { location: "trash" })}
        />
      </div>
    </div>
  )
}
