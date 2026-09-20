import { Eclipse, Monitor, Moon, Search, Sun, Wifi } from "lucide-react"
import { useEffect, useState } from "react"

import { Logo } from "@/components/Logo"
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from "@/components/ui/menubar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getDesktopApp, dockApps } from "@/apps/registry"
import { useClock24, useSetting } from "@/hooks/useSetting"
import { useTheme } from "@/hooks/useTheme"
import { formatDuration, formatRate, initials } from "@/lib/format"
import { api } from "@/services/api"
import { keys, useSystemInfo } from "@/services/queries"
import { useMenus, type MenuItemDef, type MenuSection } from "@/stores/menus"
import { useMetrics } from "@/stores/metrics"
import { useUi } from "@/stores/ui"
import { useWindows } from "@/stores/windows"
import { launch, MENUBAR_HEIGHT } from "@/windows/launch"
import { useQueryClient } from "@tanstack/react-query"
import { locale, t, type MessageKey } from "@/i18n"

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? "⌘" : "Ctrl+"

const triggerCls = "h-full rounded-md px-2.5 text-[13.5px] font-normal data-[state=open]:bg-foreground/10 hover:bg-foreground/8 focus:bg-transparent"

function Clock() {
  const [now, setNow] = useState(() => new Date())
  const [h24] = useClock24()
  useEffect(() => {
    const tick = () => setNow(new Date())
    const t = window.setInterval(tick, 15_000)
    return () => window.clearInterval(t)
  }, [])
  const date = now.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" })
  const time = now.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit", hour12: !h24 })
  return <span className="px-1 text-[13.5px] tabular-nums">{date} {time}</span>
}

function NetworkPopover() {
  const { data: info } = useSystemInfo()
  const net = useMetrics((s) => s.latest?.net)
  return (
    <Popover>
      <PopoverTrigger className="rounded-md p-1.5 hover:bg-foreground/8" aria-label={t("menubar.network")}><Wifi className="size-[17px]" /></PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 text-[13px]">
        <p className="font-semibold">{info?.hostname ?? t("menubar.server")}</p>
        {info?.ips.map((ip) => <p key={ip} className="text-muted-foreground tabular-nums">{ip}</p>)}
        <div className="mt-1.5 flex justify-between border-t pt-2 text-muted-foreground tabular-nums">
          <span>↓ {formatRate(net?.rx ?? 0)}</span><span>↑ {formatRate(net?.tx ?? 0)}</span>
        </div>
        {info && <p className="text-muted-foreground">{t("menubar.uptime", { time: formatDuration(info.uptime) })}</p>}
      </PopoverContent>
    </Popover>
  )
}

function DisplayPopover() {
  const { theme, setTheme } = useTheme()
  const editing = useUi((s) => s.editingWidgets)
  return (
    <Popover>
      <PopoverTrigger className="rounded-md p-1.5 hover:bg-foreground/8" aria-label={t("menubar.display")}><Eclipse className="size-[17px]" /></PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3 text-[13px]">
        <p className="font-semibold">{t("menubar.appearance")}</p>
        <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v as typeof theme)} variant="outline" className="w-full">
          <ToggleGroupItem value="light" className="flex-1 gap-1.5"><Sun className="size-3.5" />{t("theme.light")}</ToggleGroupItem>
          <ToggleGroupItem value="dark" className="flex-1 gap-1.5"><Moon className="size-3.5" />{t("theme.dark")}</ToggleGroupItem>
          <ToggleGroupItem value="system" className="flex-1 gap-1.5"><Monitor className="size-3.5" />{t("theme.auto")}</ToggleGroupItem>
        </ToggleGroup>
        <button className="rounded-md px-2 py-1.5 text-left hover:bg-foreground/8" onClick={() => useUi.getState().setEditingWidgets(!editing)}>
          {editing ? t("menubar.done_editing_widgets") : t("menubar.edit_widgets")}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function renderItems(items: MenuItemDef[] | undefined, fallbackEmpty = t("menubar.nothing_available")) {
  if (!items || items.length === 0) return <MenubarItem disabled>{fallbackEmpty}</MenubarItem>
  return items.map((it, i) => (
    <div key={`${it.label}-${i}`}>
      {it.separatorBefore && <MenubarSeparator />}
      <MenubarItem disabled={it.disabled} onSelect={() => it.onSelect?.()}>
        {it.label}
        {it.shortcut && <MenubarShortcut>{it.shortcut}</MenubarShortcut>}
      </MenubarItem>
    </div>
  ))
}

export function MenuBar({ onLock, onAbout }: { onLock: () => void; onAbout: () => void }) {
  const focusedId = useWindows((s) => s.focusedId)
  const windows = useWindows((s) => s.windows)
  const focused = windows.find((w) => w.id === focusedId && !w.minimized)
  const app = focused ? getDesktopApp(focused.appId) : undefined
  const appMenus = useMenus((s) => (focusedId ? s.byWindow[focusedId] : undefined))
  const [name] = useSetting("profile.name")
  const { theme, setTheme } = useTheme()
  const editing = useUi((s) => s.editingWidgets)
  const qc = useQueryClient()
  const store = useWindows.getState()

  const section = (label: MenuSection, fallback: MenuItemDef[]) => (
    <MenubarMenu>
      <MenubarTrigger className={triggerCls}>{t(`menu.${label.toLowerCase()}` as MessageKey)}</MenubarTrigger>
      <MenubarContent className="min-w-56">{renderItems(appMenus?.[label] ?? fallback)}</MenubarContent>
    </MenubarMenu>
  )

  const logout = async () => {
    await api.post("/api/auth/logout")
    qc.invalidateQueries({ queryKey: keys.auth })
    onLock()
  }

  return (
    <header className="glass fixed inset-x-0 top-0 z-[8500] flex items-stretch justify-between rounded-none border-x-0 border-t-0 px-2 text-foreground shadow-none" style={{ height: MENUBAR_HEIGHT, background: "var(--menubar)" }}>
      <Menubar className="h-full gap-0 border-0 bg-transparent p-0 shadow-none">
        <MenubarMenu>
          <MenubarTrigger className="h-full rounded-md px-2.5 data-[state=open]:bg-foreground/10 hover:bg-foreground/8" aria-label={t("app.name")}><Logo /></MenubarTrigger>
          <MenubarContent className="min-w-56">
            <MenubarItem onSelect={onAbout}>{t("menubar.about")}</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={() => launch("settings")}>{t("menubar.settings")}<MenubarShortcut>{MOD},</MenubarShortcut></MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={logout}>{t("menubar.sign_out", { name })}</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <span className="px-2.5 text-[13.5px] font-semibold">{app?.title ?? t("app.name")}</span>

        {section("File", [
          { label: t("menubar.new_files_window"), onSelect: () => launch("files", undefined, { forceNew: true }) },
          { label: t("menubar.close_window"), disabled: !focused, onSelect: () => focused && store.close(focused.id), separatorBefore: true },
        ])}
        {section("Edit", [
          { label: t("edit.undo"), disabled: true }, { label: t("edit.redo"), disabled: true },
          { label: t("edit.cut"), disabled: true, separatorBefore: true }, { label: t("edit.copy"), disabled: true }, { label: t("edit.paste"), disabled: true },
        ])}
        <MenubarMenu>
          <MenubarTrigger className={triggerCls}>{t("menu.view")}</MenubarTrigger>
          <MenubarContent className="min-w-56">
            {appMenus?.View && renderItems(appMenus.View)}
            {appMenus?.View && <MenubarSeparator />}
            <MenubarItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>{t("menubar.toggle_dark")}</MenubarItem>
            <MenubarItem onSelect={() => useUi.getState().setEditingWidgets(!editing)}>{editing ? t("menubar.done_editing_widgets_title") : t("menubar.edit_widgets_title")}</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>{t("menubar.fullscreen")}</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger className={triggerCls}>{t("menu.go")}</MenubarTrigger>
          <MenubarContent className="min-w-56">
            {appMenus?.Go && renderItems(appMenus.Go)}
            {appMenus?.Go && <MenubarSeparator />}
            {dockApps.map((a) => <MenubarItem key={a.id} onSelect={() => launch(a.id)}>{a.title}</MenubarItem>)}
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger className={triggerCls}>{t("menu.window")}</MenubarTrigger>
          <MenubarContent className="min-w-56">
            <MenubarItem disabled={!focused} onSelect={() => focused && store.minimize(focused.id)}>{t("window.minimize")}</MenubarItem>
            <MenubarItem disabled={!focused} onSelect={() => focused && store.toggleMaximize(focused.id)}>{t("window.zoom")}</MenubarItem>
            <MenubarItem disabled={!focused} onSelect={() => focused && store.close(focused.id)}>{t("window.close")}</MenubarItem>
            {windows.length > 0 && <MenubarSeparator />}
            {windows.map((w) => (
              <MenubarItem key={w.id} onSelect={() => store.focus(w.id)}>
                {w.id === focusedId ? "✓ " : ""}{w.title ?? getDesktopApp(w.appId)?.title}
              </MenubarItem>
            ))}
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger className={triggerCls}>{t("menu.help")}</MenubarTrigger>
          <MenubarContent className="min-w-56">
            <MenubarItem onSelect={() => window.open("https://github.com/JonathanLemes/NodeDesk", "_blank", "noopener")}>{t("menubar.github")}</MenubarItem>
            <MenubarItem onSelect={() => useUi.getState().setSpotlightOpen(true)}>{t("common.search")}<MenubarShortcut>{MOD}K</MenubarShortcut></MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="flex items-center gap-1.5">
        <button className="rounded-md p-1.5 hover:bg-foreground/8" aria-label={t("common.search")} onClick={() => useUi.getState().setSpotlightOpen(true)}><Search className="size-[17px]" /></button>
        <DisplayPopover />
        <NetworkPopover />
        <Clock />
        <button onClick={() => launch("settings")} aria-label={t("menubar.account")} className="ml-1 grid size-[22px] place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {initials(name)}
        </button>
      </div>
    </header>
  )
}
