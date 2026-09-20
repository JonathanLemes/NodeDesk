import { create } from "zustand"

import type { Sample } from "@/types/api"

const MAX_HISTORY = 300

interface MetricsStore {
  latest: Sample | null
  history: Sample[]
  connected: boolean
  push: (s: Sample) => void
  seed: (h: Sample[]) => void
  setConnected: (c: boolean) => void
}

export const useMetrics = create<MetricsStore>((set) => ({
  latest: null,
  history: [],
  connected: false,
  push: (s) =>
    set((st) => {
      const history = st.history.length >= MAX_HISTORY ? st.history.slice(1) : st.history.slice()
      history.push(s)
      return { latest: s, history }
    }),
  seed: (h) => set((st) => ({ history: h.slice(-MAX_HISTORY), latest: h[h.length - 1] ?? st.latest })),
  setConnected: (connected) => set({ connected }),
}))
