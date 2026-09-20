// Key combinations: parsing, matching an event, and showing them to people.
//
// A binding is written "Mod+Shift+K": modifiers first, then one key. `Mod` is ⌘ on Apple
// platforms and Ctrl elsewhere, so a saved binding follows the person across machines. Keys are
// physical (KeyboardEvent.code), so Option/AltGr characters and other layouts do not change them.

export const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

type Modifier = "Ctrl" | "Alt" | "Shift" | "Meta"
const ORDER: Modifier[] = ["Ctrl", "Alt", "Shift", "Meta"]

const CODE_NAMES: Record<string, string> = {
  Equal: "=", Minus: "-", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
  BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Backquote: "`", Space: "Space",
}
const NAMED = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape", "Tab", "Backspace", "Delete",
  "Home", "End", "PageUp", "PageDown", "Insert",
])

/** The key of an event as used in bindings, or null for a bare modifier / unsupported key. */
export function keyToken(e: KeyboardEvent): string | null {
  const c = e.code
  if (/^Key[A-Z]$/.test(c)) return c.slice(3)
  if (/^Digit\d$/.test(c)) return c.slice(5)
  if (c in CODE_NAMES) return CODE_NAMES[c]
  if (NAMED.has(e.key) || /^F\d{1,2}$/.test(e.key)) return e.key
  if (!c && e.key.length === 1) return e.key.toUpperCase() // synthetic events without a code
  return null
}

/** Canonical combo of an event ("Ctrl+Shift+K"), with real modifiers (no `Mod`). */
export function comboOf(e: KeyboardEvent): string | null {
  const key = keyToken(e)
  if (!key) return null
  const mods: Modifier[] = []
  if (e.ctrlKey) mods.push("Ctrl")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")
  if (e.metaKey) mods.push("Meta")
  return [...mods, key].join("+")
}

/** Parses a binding ("Mod+K") into its canonical real-modifier combo, or null when malformed. */
export function canonical(binding: string): string | null {
  const parts = binding.split("+")
  const key = parts.pop()
  if (!key) return null
  const mods = new Set<Modifier>()
  for (const p of parts) {
    if (p === "Mod") mods.add(isApple ? "Meta" : "Ctrl")
    else if (p === "Ctrl" || p === "Alt" || p === "Shift" || p === "Meta") mods.add(p)
    else return null
  }
  return [...ORDER.filter((m) => mods.has(m)), key].join("+")
}

/** Turns a captured event into a portable binding (⌘ on a Mac and Ctrl elsewhere become `Mod`). */
export function bindingOf(e: KeyboardEvent): string | null {
  const key = keyToken(e)
  if (!key) return null
  const mods: string[] = []
  if (isApple ? e.metaKey : e.ctrlKey) mods.push("Mod")
  if (isApple ? e.ctrlKey : e.metaKey) mods.push(isApple ? "Ctrl" : "Meta")
  if (e.altKey) mods.push("Alt")
  if (e.shiftKey) mods.push("Shift")
  return [...mods, key].join("+")
}

/** Whether a binding is allowed for a global shortcut: bare letters would hijack typing. */
export function isSafeGlobal(binding: string): boolean {
  const parts = binding.split("+")
  const key = parts[parts.length - 1]
  return (parts.length > 1 && parts.slice(0, -1).some((m) => m !== "Shift")) || /^F\d{1,2}$/.test(key)
}

const APPLE_SYMBOLS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘", Mod: "⌘" }
const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backspace: "⌫", Delete: "Del", Enter: "↵", PageUp: "PgUp", PageDown: "PgDn",
}

/** Human-readable form: "⌘K" on a Mac, "Ctrl+K" elsewhere. */
export function formatBinding(binding: string): string {
  const parts = binding.split("+")
  const key = parts.pop() ?? ""
  const label = KEY_LABELS[key] ?? key
  const mods = parts.map((m) => (m === "Mod" ? (isApple ? "Meta" : "Ctrl") : m))
  const ordered = ORDER.filter((m) => mods.includes(m))
  if (isApple) return ordered.map((m) => APPLE_SYMBOLS[m]).join("") + label
  return [...ordered, label].join("+")
}
