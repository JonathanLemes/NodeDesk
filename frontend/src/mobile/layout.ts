import { useCallback, useRef } from "react"

import { useSettings, useUpdateSettings } from "@/services/queries"

export interface HomeLayout { order: string[]; hidden: string[] }
export const EMPTY_LAYOUT: HomeLayout = { order: [], hidden: [] }

/** Cell keys: `app-<id>` for built-in apps, `svc-<id>` for your services. */
export const cellKey = { app: (id: string) => `app-${id}`, service: (id: string) => `svc-${id}` }

/** Orders cells by the saved layout; unknown (new) cells go last, hidden ones are dropped. */
export function applyLayout<T extends { key: string }>(cells: T[], layout: HomeLayout): T[] {
  const hidden = new Set(layout.hidden)
  const byKey = new Map(cells.map((c) => [c.key, c]))
  const out: T[] = []
  for (const k of layout.order) {
    const c = byKey.get(k)
    if (c && !hidden.has(k)) {
      out.push(c)
      byKey.delete(k)
    }
  }
  for (const c of byKey.values()) if (!hidden.has(c.key)) out.push(c)
  return out
}

/** Saved home-screen layout plus a debounced saver (drags change it many times a second). */
export function useHomeLayout(): [HomeLayout, (next: HomeLayout, immediate?: boolean) => void] {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const timer = useRef<number | undefined>(undefined)
  const save = useCallback(
    (next: HomeLayout, immediate = false) => {
      window.clearTimeout(timer.current)
      const run = () => update.mutate({ "mobile.layout": next })
      if (immediate) run()
      else timer.current = window.setTimeout(run, 400)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return [data?.["mobile.layout"] ?? EMPTY_LAYOUT, save]
}
