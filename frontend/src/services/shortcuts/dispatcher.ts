import { useWindows } from "@/stores/windows"
import { bindingsOf } from "@/services/shortcuts/bindings"
import { SHORTCUTS } from "@/services/shortcuts/catalog"
import { canonical, comboOf } from "@/services/shortcuts/keys"
import type { ShortcutHandler } from "@/services/shortcuts/types"

export interface Registration {
  id: string
  handler: () => ShortcutHandler
  /** The window this handler belongs to; null for desktop-wide handlers. */
  windowId: string | null
  /** Narrows the handler to events originating inside this element. */
  within?: () => HTMLElement | null
}

const registrations = new Set<Registration>()

export function register(reg: Registration): () => void {
  registrations.add(reg)
  return () => void registrations.delete(reg)
}

// Editing combos a text field must keep for itself.
const NATIVE_EDIT = new Set(["Ctrl+A", "Ctrl+C", "Ctrl+X", "Ctrl+V", "Ctrl+Z", "Ctrl+Y", "Meta+A", "Meta+C", "Meta+X", "Meta+V", "Meta+Z", "Ctrl+Shift+Z", "Meta+Shift+Z"])

const isEditable = (el: Element) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/**
 * While a terminal has focus, a plain Ctrl/Alt/bare key belongs to the shell (Ctrl+K is "kill
 * line"), so only combos a shell never uses may trigger desktop-wide shortcuts.
 */
const shellSafe = (e: KeyboardEvent) => e.metaKey || (e.ctrlKey && e.shiftKey)

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return
  const combo = comboOf(e)
  if (!combo) return

  const target = e.target instanceof Element ? e.target : document.body
  const inTerminal = !!target.closest("[data-shortcuts-passthrough]")
  if (!inTerminal && isEditable(target) && (!(e.ctrlKey || e.altKey || e.metaKey) || NATIVE_EDIT.has(combo))) return

  const focusedId = useWindows.getState().focusedId
  for (const def of SHORTCUTS) {
    if (!bindingsOf(def.id).some((b) => canonical(b) === combo)) continue
    const isGlobal = def.scope === "global"
    if (isGlobal && inTerminal && !shellSafe(e)) continue

    // Later registrations first: a component mounted on top of another one takes precedence.
    for (const reg of [...registrations].reverse()) {
      if (reg.id !== def.id) continue
      if (reg.windowId) {
        if (reg.windowId !== focusedId) continue
        const win = document.querySelector(`[data-window-id="${CSS.escape(reg.windowId)}"]`)
        // Dialogs and menus are portalled outside the window: keys typed there are not the app's.
        if (target !== document.body && !win?.contains(target)) continue
        const within = reg.within?.()
        if (within && !within.contains(target)) continue
      }
      if (reg.handler()(e) !== false) { // only an explicit `false` declines
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }
  }
}

/** One capture-phase listener for the whole desktop; capture so it runs before the terminal sees the key. */
export function installShortcuts(): () => void {
  window.addEventListener("keydown", onKeyDown, true)
  return () => window.removeEventListener("keydown", onKeyDown, true)
}
