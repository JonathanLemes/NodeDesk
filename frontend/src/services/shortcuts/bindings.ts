import { queryClient } from "@/services/queryClient"
import { keys } from "@/services/queries"
import { defaultBindings, getShortcut, SHORTCUTS } from "@/services/shortcuts/catalog"
import type { Settings } from "@/types/api"

/** User overrides from settings, read straight from the query cache so key handlers stay synchronous. */
export const overrides = (): Record<string, string[]> => queryClient.getQueryData<Settings>(keys.settings)?.shortcuts ?? {}

/** The bindings in force for a shortcut: the user's choice, or the default. An empty list means unbound. */
export function bindingsOf(id: string, saved = overrides()): string[] {
  const def = getShortcut(id)
  if (!def) return []
  return def.fixed ? defaultBindings(def) : (saved[id] ?? defaultBindings(def))
}

export const isCustomised = (id: string, saved = overrides()) => id in saved

/** Other shortcuts that would fire on the same keys as `binding` when bound to `id`. */
export function conflictsFor(id: string, binding: string, canonicalOf: (b: string) => string | null, saved = overrides()) {
  const def = getShortcut(id)
  const wanted = canonicalOf(binding)
  if (!def || !wanted) return []
  return SHORTCUTS.filter((o) =>
    o.id !== id &&
    (o.scope === def.scope || o.scope === "global" || def.scope === "global") &&
    bindingsOf(o.id, saved).some((b) => canonicalOf(b) === wanted),
  )
}
