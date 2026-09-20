import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { WebglAddon } from "@xterm/addon-webgl"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"

import { TERMINAL_FONT, TERMINAL_THEMES } from "@/apps/terminal/theme"
import { installTouchScroll } from "@/apps/terminal/touchScroll"
import { t } from "@/i18n"
import { ApiError } from "@/services/api"
import { terminalApi } from "@/services/queries"

/** What the app (tabs, key bar, shortcuts) can ask a terminal to do. */
export interface TerminalHandle {
  focus: () => void
  getSelection: () => string
  selectAll: () => void
  clear: () => void
  paste: (text: string) => void
  /** Raw keystrokes to the shell (already-encoded bytes such as "\x1b" or "\t"). */
  send: (data: string) => void
  arrow: (dir: "up" | "down" | "left" | "right") => void
}

/** Sticky Ctrl / Alt from the mobile key bar: applied to the next typed character, then cleared. */
export interface Modifiers { ctrl: boolean; alt: boolean; consume: () => void; toggle: (key: "ctrl" | "alt") => void }

interface Props {
  ref?: Ref<TerminalHandle>
  sessionId: string
  active: boolean
  dark: boolean
  fontSize: number
  /** Touch device: no WebGL, no auto-focus fight with the on-screen keyboard. */
  touch: boolean
  modifiers: Modifiers
  onTitle: (title: string) => void
  onExit: (code: number) => void
  /** The session no longer exists on the server (reaped or killed). */
  onLost: () => void
}

const enc = new TextEncoder()

/** Applies sticky Ctrl/Alt to one typed character. */
function withModifiers(data: string, m: Modifiers): string {
  if (data.length !== 1 || (!m.ctrl && !m.alt)) return data
  let out = data
  if (m.ctrl) {
    const c = out.toUpperCase().charCodeAt(0)
    if (out === " ") out = "\x00"
    else if (c >= 64 && c <= 95) out = String.fromCharCode(c - 64) // A-Z @ [ \ ] ^ _
  }
  m.consume()
  return m.alt ? `\x1b${out}` : out
}

export function TerminalView({ ref, sessionId, active, dark, fontSize, touch, modifiers, onTitle, onExit, onLost }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<"connecting" | "open" | "reconnecting" | "ended">("connecting")

  // The latest callbacks, without re-running the connection effect when parents re-render.
  const cb = useRef({ onTitle, onExit, onLost, modifiers, active })
  cb.current = { onTitle, onExit, onLost, modifiers, active }

  const send = (data: string | Uint8Array<ArrayBuffer>) => {
    const ws = socket.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(typeof data === "string" ? enc.encode(data) : data)
  }

  useImperativeHandle(ref, () => ({
    focus: () => term.current?.focus(),
    getSelection: () => term.current?.getSelection() ?? "",
    selectAll: () => term.current?.selectAll(),
    clear: () => {
      // Like macOS ⌘K: drop the scrollback and redraw the prompt line at the top.
      term.current?.clear()
      send("\x0c")
    },
    paste: (text) => term.current?.paste(text),
    send,
    arrow: (dir) => {
      const app = term.current?.modes.applicationCursorKeysMode
      const code = { up: "A", down: "B", right: "C", left: "D" }[dir]
      send(`${app ? "\x1bO" : "\x1b["}${code}`)
    },
  }))

  // One xterm instance per tab, created once.
  useEffect(() => {
    const el = host.current!
    const tm = new Terminal({
      fontFamily: TERMINAL_FONT,
      fontSize,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      scrollback: 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
      theme: TERMINAL_THEMES[dark ? "dark" : "light"],
    })
    const fa = new FitAddon()
    tm.loadAddon(fa)
    tm.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, "_blank", "noopener,noreferrer")))
    tm.open(el)
    if (!touch) {
      try {
        const gl = new WebglAddon()
        gl.onContextLoss(() => gl.dispose())
        tm.loadAddon(gl)
      } catch {
        /* no WebGL: the DOM renderer is fine */
      }
    }
    term.current = tm
    fit.current = fa
    const removeTouchScroll = touch ? installTouchScroll(el, tm, (d) => send(d)) : undefined

    tm.onTitleChange((title) => cb.current.onTitle(title))
    tm.onData((d) => send(withModifiers(d, cb.current.modifiers)))
    tm.onBinary((d) => send(Uint8Array.from(d, (c) => c.charCodeAt(0)))) // mouse reports use raw bytes
    tm.onResize(({ cols, rows }) => {
      const ws = socket.current
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols, rows }))
    })

    // ---- connection, with re-attach: the server keeps the shell for a while after a drop
    let disposed = false
    let ended = false
    let retry = 0
    let timer: number | undefined
    let first = true

    const connect = () => {
      if (disposed || ended) return
      const ws = new WebSocket(terminalApi.socketUrl(sessionId))
      ws.binaryType = "arraybuffer"
      socket.current = ws
      ws.onopen = () => {
        retry = 0
        setStatus("open")
        if (!first) tm.reset() // the server replays recent output; start from a clean screen
        first = false
        ws.send(JSON.stringify({ type: "resize", cols: tm.cols, rows: tm.rows }))
      }
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          tm.write(new Uint8Array(ev.data))
          return
        }
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; code?: number }
          if (msg.type === "exit") {
            ended = true
            setStatus("ended")
            cb.current.onExit(msg.code ?? 0)
          }
        } catch {
          /* ignore unknown control frames */
        }
      }
      ws.onclose = async () => {
        if (disposed || ended || socket.current !== ws) return
        setStatus("reconnecting")
        // A 404 means the shell is gone (reaped while we were away); anything else is the network.
        try {
          await terminalApi.get(sessionId)
        } catch (e) {
          if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
            ended = true
            setStatus("ended")
            cb.current.onLost()
            return
          }
        }
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000))
      }
    }
    connect()

    // Coming back to the page (phone unlocked, laptop woke): reconnect right away.
    const wake = () => {
      if (document.visibilityState !== "visible" || disposed || ended) return
      if (socket.current?.readyState !== WebSocket.OPEN && socket.current?.readyState !== WebSocket.CONNECTING) {
        window.clearTimeout(timer)
        retry = 0
        connect()
      }
    }
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("online", wake)

    // ---- size
    let raf = 0
    const refit = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (el.clientWidth > 20 && el.clientHeight > 20) {
          try {
            fa.fit()
          } catch {
            /* not laid out yet */
          }
        }
      })
    }
    const ro = new ResizeObserver(refit)
    ro.observe(el)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("online", wake)
      ro.disconnect()
      removeTouchScroll?.()
      socket.current?.close()
      socket.current = null
      tm.dispose()
      term.current = null
      fit.current = null
    }
    // A tab is bound to its session for life; look (theme, font) updates below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    if (term.current) term.current.options.theme = TERMINAL_THEMES[dark ? "dark" : "light"]
  }, [dark])

  useEffect(() => {
    const tm = term.current
    if (!tm || tm.options.fontSize === fontSize) return
    tm.options.fontSize = fontSize
    fit.current?.fit()
  }, [fontSize])

  // Showing a tab: fit it (it was display:none, so it could not measure) and give it the keyboard.
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      try {
        fit.current?.fit()
      } catch {
        /* ignore */
      }
      if (!touch) term.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active, touch])

  return (
    <div className="relative h-full w-full" style={{ background: TERMINAL_THEMES[dark ? "dark" : "light"].background }}>
      <div ref={host} className="absolute inset-0 p-2 pb-1" />
      {status !== "open" && (
        <div className="pointer-events-none absolute top-2 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] text-white">
          {status === "ended" ? t("terminal.ended") : status === "reconnecting" ? t("terminal.reconnecting") : t("terminal.connecting")}
        </div>
      )}
    </div>
  )
}
