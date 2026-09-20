import { useCallback, useEffect, useRef, type RefObject } from "react"

import { useSettings, useUpdateSettings } from "@/services/queries"
import { bindingsOf } from "@/services/shortcuts/bindings"
import { register } from "@/services/shortcuts/dispatcher"
import { formatBinding } from "@/services/shortcuts/keys"
import type { ShortcutHandler } from "@/services/shortcuts/types"
import { useOptionalWindowContext } from "@/windows/context"

/**
 * Runs `handler` when the shortcut `id` is pressed. Inside a window the handler only fires while
 * that window has focus (and, with `within`, only for keys typed inside that element).
 * Return `false` from the handler to let the key carry on.
 */
export function useShortcut(id: string, handler: ShortcutHandler | null, opts?: { within?: RefObject<HTMLElement | null> }) {
  const windowId = useOptionalWindowContext()?.windowId ?? null
  const latest = useRef(handler)
  latest.current = handler
  const within = opts?.within
  useEffect(
    () => register({ id, windowId, handler: () => (e) => (latest.current ? latest.current(e) : false), within: within && (() => within.current) }),
    [id, windowId, within],
  )
}

/** Batch form of useShortcut for components that own several. */
export function useShortcuts(handlers: Record<string, ShortcutHandler | null>, opts?: { within?: RefObject<HTMLElement | null> }) {
  const windowId = useOptionalWindowContext()?.windowId ?? null
  const latest = useRef(handlers)
  latest.current = handlers
  const within = opts?.within
  const ids = Object.keys(handlers).join("|")
  useEffect(() => {
    const offs = ids.split("|").filter(Boolean).map((id) =>
      register({ id, windowId, handler: () => (e) => latest.current[id]?.(e) ?? false, within: within && (() => within.current) }),
    )
    return () => offs.forEach((off) => off())
  }, [ids, windowId, within])
}

/** The label of a shortcut's current binding ("Ctrl+K"), or "" when unbound; re-renders when settings change. */
export function useShortcutLabels(): (id: string) => string {
  const { data } = useSettings()
  const saved = data?.shortcuts
  return useCallback((id: string) => {
    const first = bindingsOf(id, saved ?? {})[0]
    return first ? formatBinding(first) : ""
  }, [saved])
}

/** Reads and edits the user's shortcut overrides (persisted in settings, shared across browsers). */
export function useShortcutSettings() {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const saved = data?.shortcuts ?? {}
  return {
    saved,
    set: (id: string, bindings: string[]) => update.mutate({ shortcuts: { ...saved, [id]: bindings } }),
    reset: (id: string) => {
      const next = { ...saved }
      delete next[id]
      update.mutate({ shortcuts: next })
    },
    resetAll: () => update.mutate({ shortcuts: {} }),
  }
}
