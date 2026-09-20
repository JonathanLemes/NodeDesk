import type { LucideIcon } from "lucide-react"
import { create } from "zustand"

export interface MenuItemDef {
  label: string
  onSelect?: () => void
  shortcut?: string
  disabled?: boolean
  icon?: LucideIcon
  checked?: boolean
  separatorBefore?: boolean
}

export type MenuSection = "File" | "Edit" | "View" | "Go"
export type AppMenus = Partial<Record<MenuSection, MenuItemDef[]>>

interface MenuStore {
  /** Menus contributed by the focused window's app, keyed by window id. */
  byWindow: Record<string, AppMenus>
  register: (windowId: string, menus: AppMenus) => void
  unregister: (windowId: string) => void
}

export const useMenus = create<MenuStore>((set) => ({
  byWindow: {},
  register: (windowId, menus) => set((s) => ({ byWindow: { ...s.byWindow, [windowId]: menus } })),
  unregister: (windowId) =>
    set((s) => {
      const next = { ...s.byWindow }
      delete next[windowId]
      return { byWindow: next }
    }),
}))
