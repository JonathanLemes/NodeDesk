import { create } from "zustand"

export interface Geometry { x: number; y: number; w: number; h: number }

export interface DesktopWindow extends Geometry {
  id: string
  appId: string
  z: number
  minimized: boolean
  maximized: boolean
  title?: string
  /** Free-form data handed to the app component (e.g. which file a viewer shows). */
  props: Record<string, unknown>
}

interface WindowStore {
  windows: DesktopWindow[]
  focusedId: string | null
  nextZ: number
  open: (win: Omit<DesktopWindow, "z" | "minimized" | "maximized" | "props"> & { props?: Record<string, unknown> }) => string
  close: (id: string) => void
  closeApp: (appId: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  restore: (id: string) => void
  toggleMaximize: (id: string) => void
  setGeometry: (id: string, g: Geometry) => void
  setTitle: (id: string, title: string) => void
  setProps: (id: string, props: Record<string, unknown>) => void
}

const BASE_Z = 100

const patch = (s: WindowStore, id: string, fn: (w: DesktopWindow) => Partial<DesktopWindow>) =>
  s.windows.map((w) => (w.id === id ? { ...w, ...fn(w) } : w))

export const useWindows = create<WindowStore>((set, get) => ({
  windows: [],
  focusedId: null,
  nextZ: BASE_Z,

  open: (win) => {
    const z = get().nextZ + 1
    set((s) => ({
      windows: [...s.windows, { ...win, props: win.props ?? {}, z, minimized: false, maximized: false }],
      focusedId: win.id,
      nextZ: z,
    }))
    return win.id
  },

  close: (id) =>
    set((s) => {
      const windows = s.windows.filter((w) => w.id !== id)
      const focusedId =
        s.focusedId === id
          ? ([...windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null)
          : s.focusedId
      return { windows, focusedId }
    }),

  closeApp: (appId) => set((s) => ({ windows: s.windows.filter((w) => w.appId !== appId) })),

  focus: (id) => {
    const s = get()
    const w = s.windows.find((x) => x.id === id)
    if (!w) return
    if (s.focusedId === id && !w.minimized) return
    const z = s.nextZ + 1
    set({ windows: patch(s, id, () => ({ z, minimized: false })), focusedId: id, nextZ: z })
  },

  minimize: (id) =>
    set((s) => {
      const windows = patch(s, id, () => ({ minimized: true }))
      const focusedId =
        s.focusedId === id ? ([...windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null) : s.focusedId
      return { windows, focusedId }
    }),

  restore: (id) => get().focus(id),

  toggleMaximize: (id) => set((s) => ({ windows: patch(s, id, (w) => ({ maximized: !w.maximized })) })),

  setGeometry: (id, g) => set((s) => ({ windows: patch(s, id, () => ({ ...g, maximized: false })) })),
  setTitle: (id, title) => set((s) => ({ windows: patch(s, id, () => ({ title })) })),
  setProps: (id, props) => set((s) => ({ windows: patch(s, id, (w) => ({ props: { ...w.props, ...props } })) })),
}))
