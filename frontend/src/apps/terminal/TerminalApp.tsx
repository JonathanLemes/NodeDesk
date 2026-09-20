import { Plus, SquareTerminal, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import type { DesktopAppProps } from "@/apps/sdk"
import { KeyBar } from "@/apps/terminal/KeyBar"
import { FONT_SIZE, loadFontSize, saveFontSize, TERMINAL_THEMES } from "@/apps/terminal/theme"
import { TerminalView, type Modifiers, type TerminalHandle } from "@/apps/terminal/TerminalView"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useTheme } from "@/hooks/useTheme"
import { t } from "@/i18n"
import { copyText, readText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { errorMessage, terminalApi, useTerminalStatus } from "@/services/queries"
import { useShortcutLabels, useShortcuts } from "@/services/shortcuts"
import { useWindows } from "@/stores/windows"
import { useWindowContext, WindowToolbar } from "@/windows/context"

interface Tab {
  key: string
  sessionId: string
  title: string
  /** Set once the shell exited or vanished; the tab stays so its output can still be read. */
  ended?: boolean
}

let tabCounter = 0

/** "user@host: ~/dir" (the usual prompt title) reads better as just "~/dir" on a tab. */
const shortTitle = (title: string) => title.split(": ").pop() || title
const baseName = (dir: string) => (dir === "/" ? "/" : dir.split("/").filter(Boolean).pop() ?? dir)

export default function TerminalApp({ windowId, props }: DesktopAppProps) {
  const isMobile = useIsMobile()
  const touch = isMobile || matchMedia("(pointer: coarse)").matches
  const { resolved } = useTheme()
  const dark = resolved === "dark"
  const { focused } = useWindowContext()
  const label = useShortcutLabels()
  const { data: status, isLoading, isError, error } = useTerminalStatus()

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(() => loadFontSize(touch))
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteDraft, setPasteDraft] = useState("")
  const [, setModTick] = useState(0)

  const stage = useRef<HTMLDivElement>(null)
  const handles = useRef(new Map<string, TerminalHandle>())
  const live = useRef(new Set<string>()) // shells to end when this window goes away
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeRef = useRef(activeKey)
  activeRef.current = activeKey

  const active = tabs.find((x) => x.key === activeKey) ?? null
  const handle = useCallback(() => (activeRef.current ? handles.current.get(activeRef.current) : undefined), [])

  // Sticky Ctrl / Alt from the key bar. A ref (not state) because the terminal reads it per keystroke.
  const mods = useMemo(() => {
    const m: Modifiers = {
      ctrl: false, alt: false,
      consume: () => {
        m.ctrl = false
        m.alt = false
        setModTick((n) => n + 1)
      },
      toggle: (key) => {
        m[key] = !m[key]
        setModTick((n) => n + 1)
      },
    }
    return m
  }, [])

  // -------------------------------------------------------------- sessions
  /** Character-grid estimate so the shell starts at about the right size; the view refits right after. */
  const guessSize = () => {
    const el = stage.current
    const w = el?.clientWidth ?? 800
    const h = el?.clientHeight ?? 400
    return { cols: Math.max(20, Math.floor((w - 16) / (fontSize * 0.602))), rows: Math.max(5, Math.floor((h - 12) / (fontSize * 1.15 * 1.17))) }
  }

  const addTab = useCallback((s: { id: string; cwd: string }) => {
    live.current.add(s.id)
    const key = `t${++tabCounter}`
    setTabs((cur) => [...cur, { key, sessionId: s.id, title: baseName(s.cwd) || t("app.terminal") }])
    setActiveKey(key)
  }, [])

  const openTab = useCallback(async (cwd?: string) => {
    try {
      // A new tab opens in the folder the current one is in, unless a folder was asked for.
      const s = await terminalApi.create({
        ...guessSize(),
        ...(cwd ? { cwd } : { from: tabsRef.current.find((x) => x.key === activeRef.current)?.sessionId }),
      })
      addTab(s)
    } catch (e) {
      toast.error(errorMessage(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTab, fontSize])

  const enabled = status?.enabled
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    terminalApi.create({ ...guessSize(), cwd: typeof props.cwd === "string" ? props.cwd : undefined }).then(
      (s) => (cancelled ? void terminalApi.kill(s.id) : addTab(s)),
      (e) => !cancelled && toast.error(errorMessage(e)),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // "Open in Terminal" from Files while this window is already open: a new tab in that folder.
  const seenOpen = useRef(props.openId)
  useEffect(() => {
    if (props.openId === seenOpen.current) return
    seenOpen.current = props.openId
    if (enabled && typeof props.cwd === "string") void openTab(props.cwd)
  }, [props.openId, props.cwd, enabled, openTab])

  const closeTab = useCallback((key: string) => {
    const list = tabsRef.current
    const i = list.findIndex((x) => x.key === key)
    if (i < 0) return
    const tab = list[i]
    live.current.delete(tab.sessionId)
    void terminalApi.kill(tab.sessionId)
    handles.current.delete(key)
    const rest = list.filter((x) => x.key !== key)
    setTabs(rest)
    if (rest.length === 0) useWindows.getState().close(windowId)
    else if (activeRef.current === key) setActiveKey(rest[Math.min(i, rest.length - 1)].key)
  }, [windowId])

  // Closing the terminal ends every shell it started, so nothing keeps using memory in the background.
  useEffect(() => {
    const ids = live.current
    const killAll = () => ids.forEach((id) => void terminalApi.kill(id, true))
    const onHide = (e: PageTransitionEvent) => !e.persisted && killAll()
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      killAll()
    }
  }, [])

  const patch = (key: string, p: Partial<Tab>) => setTabs((cur) => cur.map((x) => (x.key === key ? { ...x, ...p } : x)))

  // The window title follows the active tab.
  useEffect(() => {
    if (active) useWindows.getState().setTitle(windowId, shortTitle(active.title))
  }, [active?.title, active?.key, windowId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focused && !touch && activeKey) handles.current.get(activeKey)?.focus()
  }, [focused, activeKey, touch])

  // ------------------------------------------------------------- clipboard
  const copy = async () => {
    const text = handle()?.getSelection()
    if (text) await copyText(text)
  }
  const paste = async () => {
    const text = await readText()
    if (text === null) {
      setPasteDraft("")
      setPasteOpen(true) // no clipboard access (plain http, or denied): let the person paste into a box
    } else if (text) handle()?.paste(text)
    handle()?.focus()
  }

  // ------------------------------------------------------------- shortcuts
  const step = (delta: number) => {
    const list = tabsRef.current
    const i = list.findIndex((x) => x.key === activeRef.current)
    if (list.length > 1 && i >= 0) setActiveKey(list[(i + delta + list.length) % list.length].key)
  }
  const zoom = (next: number) => {
    const n = Math.max(FONT_SIZE.min, Math.min(FONT_SIZE.max, next))
    setFontSize(n)
    saveFontSize(n)
  }
  useShortcuts({
    "terminal.newTab": () => void openTab(),
    "terminal.closeTab": () => activeRef.current && closeTab(activeRef.current),
    "terminal.nextTab": () => step(1),
    "terminal.prevTab": () => step(-1),
    "terminal.clear": () => handle()?.clear(),
    // Without a selection, ⌘C / Ctrl+Shift+C have nothing to copy: leave the key alone.
    "terminal.copy": () => {
      if (!handle()?.getSelection()) return false
      void copy()
    },
    "terminal.selectAll": () => handle()?.selectAll(),
    "terminal.fontBigger": () => zoom(fontSize + 1),
    "terminal.fontSmaller": () => zoom(fontSize - 1),
    "terminal.fontReset": () => zoom(loadFontSizeDefault(touch)),
  })

  // ----------------------------------------------------------------- render
  if (isLoading) return <div className="grid h-full place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>
  if (isError) {
    return <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><X /></EmptyMedia><EmptyTitle>{t("terminal.unavailable")}</EmptyTitle><EmptyDescription>{errorMessage(error)}</EmptyDescription></EmptyHeader></Empty>
  }
  if (!enabled) {
    return <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><SquareTerminal /></EmptyMedia><EmptyTitle>{t("terminal.disabled_title")}</EmptyTitle><EmptyDescription>{t("terminal.disabled_desc")}</EmptyDescription></EmptyHeader></Empty>
  }

  const newTabButton = (
    <button
      aria-label={t("terminal.new_tab")}
      title={`${t("terminal.new_tab")} ${label("terminal.newTab")}`.trim()}
      onClick={() => void openTab()}
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/8 hover:text-foreground max-md:size-9"
    >
      <Plus className="size-4" />
    </button>
  )

  const menu = (
    <>
      <ContextMenuItem onSelect={copy} disabled={!handle()?.getSelection()}>{t("edit.copy")}</ContextMenuItem>
      <ContextMenuItem onSelect={paste}>{t("edit.paste")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => handle()?.selectAll()}>{t("edit.select_all")}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => handle()?.clear()}>{t("terminal.clear")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => void openTab()}>{t("terminal.new_tab")}</ContextMenuItem>
    </>
  )

  return (
    <div className="flex h-full flex-col" data-shortcuts-passthrough style={{ background: TERMINAL_THEMES[dark ? "dark" : "light"].background }}>
      {isMobile ? (
        // On a phone the tabs live in the header, left of the ✕ that closes the app.
        <WindowToolbar>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveKey(tab.key)}
                className={cn("flex h-8 max-w-40 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px]", tab.key === activeKey ? "bg-foreground/12 font-medium" : "text-muted-foreground")}
              >
                <span className="truncate">{shortTitle(tab.title)}</span>
                {tabs.length > 1 && tab.key === activeKey && (
                  <span role="button" aria-label={t("terminal.close_tab")} onClick={(e) => { e.stopPropagation(); closeTab(tab.key) }} className="grid size-4 place-items-center rounded-full bg-foreground/15"><X className="size-3" /></span>
                )}
              </button>
            ))}
            {newTabButton}
          </div>
        </WindowToolbar>
      ) : (
        <div role="tablist" className="flex h-8 shrink-0 items-stretch border-b border-border/70 bg-muted/40 text-[12px]">
          <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <div
                key={tab.key}
                role="tab"
                aria-selected={tab.key === activeKey}
                onMouseDown={(e) => e.button === 0 && setActiveKey(tab.key)}
                onAuxClick={(e) => e.button === 1 && closeTab(tab.key)}
                className={cn(
                  "group/tab flex max-w-[220px] min-w-[120px] flex-1 cursor-default items-center gap-2 border-r border-border/70 px-3 select-none",
                  tab.key === activeKey ? "bg-window text-foreground" : "text-muted-foreground hover:bg-foreground/5",
                )}
              >
                <span className={cn("min-w-0 flex-1 truncate", tab.ended && "line-through opacity-60")}>{shortTitle(tab.title)}</span>
                <button
                  aria-label={t("terminal.close_tab")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => closeTab(tab.key)}
                  className="grid size-4 shrink-0 place-items-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-foreground/15 focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          {newTabButton}
        </div>
      )}

      <div ref={stage} className="relative min-h-0 flex-1">
        {tabs.map((tab) => {
          const view = (
            <TerminalView
              ref={(h) => {
                if (h) handles.current.set(tab.key, h)
                else handles.current.delete(tab.key)
              }}
              sessionId={tab.sessionId}
              active={tab.key === activeKey}
              dark={dark}
              fontSize={fontSize}
              touch={touch}
              modifiers={mods}
              onTitle={(title) => title && patch(tab.key, { title })}
              onExit={(code) => (code === 0 ? closeTab(tab.key) : patch(tab.key, { ended: true }))}
              onLost={() => patch(tab.key, { ended: true })}
            />
          )
          return (
            <div key={tab.key} className={cn("absolute inset-0", tab.key !== activeKey && "invisible")}>
              {isMobile ? view : (
                <ContextMenu>
                  <ContextMenuTrigger asChild><div className="h-full">{view}</div></ContextMenuTrigger>
                  <ContextMenuContent className="min-w-48" onCloseAutoFocus={(e) => { e.preventDefault(); handle()?.focus() }}>{menu}</ContextMenuContent>
                </ContextMenu>
              )}
            </div>
          )
        })}
      </div>

      {touch && (
        <KeyBar
          handle={handle}
          ctrl={mods.ctrl}
          alt={mods.alt}
          onCtrl={() => mods.toggle("ctrl")}
          onAlt={() => mods.toggle("alt")}
          onPaste={paste}
        />
      )}

      <Dialog open={pasteOpen} onOpenChange={(o) => { setPasteOpen(o); if (!o) handle()?.focus() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("terminal.paste_title")}</DialogTitle>
            <DialogDescription>{t("terminal.paste_hint")}</DialogDescription>
          </DialogHeader>
          <Textarea value={pasteDraft} onChange={(e) => setPasteDraft(e.target.value)} autoFocus rows={5} className="font-mono text-[13px]" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={!pasteDraft} onClick={() => { handle()?.paste(pasteDraft); setPasteOpen(false) }}>{t("terminal.send")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const loadFontSizeDefault = (touch: boolean) => (touch ? 12 : 13)
