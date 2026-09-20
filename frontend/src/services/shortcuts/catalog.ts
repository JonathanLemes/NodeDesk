import global from "@/services/shortcuts/global"
import { isApple } from "@/services/shortcuts/keys"
import type { ShortcutDef } from "@/services/shortcuts/types"

// Every `src/apps/<name>/shortcuts.ts` contributes that app's shortcuts (scope = the app's id).
const modules = import.meta.glob<{ default: ShortcutDef[] }>("/src/apps/*/shortcuts.ts", { eager: true })

/** App-scoped shortcuts come first so they win over a global one bound to the same keys. */
export const SHORTCUTS: ShortcutDef[] = [...Object.values(modules).flatMap((m) => m.default), ...global]

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]))
export const getShortcut = (id: string) => byId.get(id)

export const defaultBindings = (def: ShortcutDef): string[] => (isApple && def.mac ? def.mac : def.keys)
