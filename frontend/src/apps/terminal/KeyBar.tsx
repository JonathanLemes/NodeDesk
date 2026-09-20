import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, KeyboardOff } from "lucide-react"
import type { ReactNode } from "react"

import type { TerminalHandle } from "@/apps/terminal/TerminalView"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"

interface Props {
  handle: () => TerminalHandle | undefined
  ctrl: boolean
  alt: boolean
  onCtrl: () => void
  onAlt: () => void
  onPaste: () => void
}

function Key({ children, onPress, active, label, wide }: { children: ReactNode; onPress: () => void; active?: boolean; label?: string; wide?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={active}
      // Keep focus in the terminal, otherwise tapping a key would close the on-screen keyboard.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cn(
        "grid h-9 shrink-0 place-items-center rounded-lg px-2.5 font-mono text-[13px] font-medium select-none active:scale-95 active:opacity-70",
        wide ? "min-w-14" : "min-w-10",
        active ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** The keys a phone keyboard lacks (Esc, Tab, Ctrl, arrows, and the symbols shells lean on). */
export function KeyBar({ handle, ctrl, alt, onCtrl, onAlt, onPaste }: Props) {
  const press = (data: string) => () => {
    const h = handle()
    h?.send(data)
    h?.focus()
  }
  const arrow = (dir: "up" | "down" | "left" | "right") => () => {
    const h = handle()
    h?.arrow(dir)
    h?.focus()
  }
  const symbol = (s: string) => <Key key={s} onPress={press(s)}>{s}</Key>

  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border/70 bg-window px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Key onPress={press("\x1b")} wide>Esc</Key>
      <Key onPress={press("\t")} wide>Tab</Key>
      <Key onPress={() => { onCtrl(); handle()?.focus() }} active={ctrl} wide>Ctrl</Key>
      <Key onPress={() => { onAlt(); handle()?.focus() }} active={alt} wide>Alt</Key>
      <Key onPress={arrow("left")} label="←"><ArrowLeft className="size-4" /></Key>
      <Key onPress={arrow("down")} label="↓"><ArrowDown className="size-4" /></Key>
      <Key onPress={arrow("up")} label="↑"><ArrowUp className="size-4" /></Key>
      <Key onPress={arrow("right")} label="→"><ArrowRight className="size-4" /></Key>
      <Key onPress={press("\x03")}>^C</Key>
      <Key onPress={press("\x04")}>^D</Key>
      {["/", "-", "|", "~", "\\", "_"].map(symbol)}
      <Key onPress={onPaste} label={t("edit.paste")}><ClipboardPaste className="size-4" /></Key>
      <Key onPress={() => (document.activeElement as HTMLElement | null)?.blur()} label={t("terminal.hide_keyboard")}><KeyboardOff className="size-4" /></Key>
    </div>
  )
}
