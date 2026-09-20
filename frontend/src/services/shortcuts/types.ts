/** A keyboard shortcut the app knows about. Bindings live in settings; this is the catalogue. */
export interface ShortcutDef {
  /** Stable id, "<scope>.<action>". Saved overrides are keyed by it. */
  id: string
  /** "global" (anywhere) or the id of a desktop app (only while one of its windows has focus). */
  scope: string
  /** Shown in Settings → Shortcuts and in menus. Use a getter so it follows the language. */
  label: string
  /** Default bindings, e.g. ["Mod+K"]. */
  keys: string[]
  /** Replaces `keys` on Apple platforms. */
  mac?: string[]
  /** Listed in Settings but not editable. */
  fixed?: boolean
}

/** Return exactly `false` to decline (the key then goes on to the next handler, or to the page). */
export type ShortcutHandler = (e: KeyboardEvent) => unknown

export const defineShortcuts = (defs: ShortcutDef[]) => defs
