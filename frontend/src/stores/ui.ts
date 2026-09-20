import { create } from "zustand"

interface UiStore {
  editingWidgets: boolean
  widgetGalleryOpen: boolean
  spotlightOpen: boolean
  setEditingWidgets: (v: boolean) => void
  setWidgetGalleryOpen: (v: boolean) => void
  setSpotlightOpen: (v: boolean) => void
}

export const useUi = create<UiStore>((set) => ({
  editingWidgets: false,
  widgetGalleryOpen: false,
  spotlightOpen: false,
  setEditingWidgets: (editingWidgets) => set({ editingWidgets, ...(editingWidgets ? {} : { widgetGalleryOpen: false }) }),
  setWidgetGalleryOpen: (widgetGalleryOpen) => set({ widgetGalleryOpen }),
  setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen }),
}))
