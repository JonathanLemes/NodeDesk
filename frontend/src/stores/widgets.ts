import { create } from "zustand"

import type { WidgetPlacement } from "@/types/api"

interface WidgetStore {
  placements: WidgetPlacement[]
  hydrated: boolean
  hydrate: (p: WidgetPlacement[]) => void
  /** Replaces the layout; callers persist it separately. */
  set: (p: WidgetPlacement[]) => void
  update: (instanceId: string, patch: Partial<WidgetPlacement>) => void
  bringToFront: (instanceId: string) => void
  remove: (instanceId: string) => void
  add: (p: WidgetPlacement) => void
}

export const useWidgetStore = create<WidgetStore>((set) => ({
  placements: [],
  hydrated: false,
  hydrate: (placements) => set({ placements, hydrated: true }),
  set: (placements) => set({ placements }),
  update: (id, patch) => set((s) => ({ placements: s.placements.map((p) => (p.instanceId === id ? { ...p, ...patch } : p)) })),
  bringToFront: (id) =>
    set((s) => {
      const top = Math.max(0, ...s.placements.map((p) => p.z)) + 1
      return { placements: s.placements.map((p) => (p.instanceId === id ? { ...p, z: top } : p)) }
    }),
  remove: (id) => set((s) => ({ placements: s.placements.filter((p) => p.instanceId !== id) })),
  add: (p) => set((s) => ({ placements: [...s.placements, p] })),
}))
