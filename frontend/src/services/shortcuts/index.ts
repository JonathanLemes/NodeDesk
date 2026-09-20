// Keyboard shortcuts as a service: a catalogue of what can be bound (global.ts and
// apps/<name>/shortcuts.ts), user overrides in settings, and one dispatcher for the whole desktop.
// Components attach behaviour with useShortcut(); Settings → Shortcuts edits the bindings.
export { installShortcuts } from "@/services/shortcuts/dispatcher"
export { useShortcut, useShortcuts, useShortcutLabels, useShortcutSettings } from "@/services/shortcuts/hooks"
export { SHORTCUTS, getShortcut, defaultBindings } from "@/services/shortcuts/catalog"
export { bindingsOf, conflictsFor, isCustomised } from "@/services/shortcuts/bindings"
export { bindingOf, canonical, formatBinding, isApple, isSafeGlobal } from "@/services/shortcuts/keys"
export type { ShortcutDef, ShortcutHandler } from "@/services/shortcuts/types"
