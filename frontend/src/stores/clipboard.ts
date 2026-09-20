import { create } from "zustand"

import type { FileRef } from "@/types/api"

interface ClipboardStore {
  items: FileRef[]
  mode: "copy" | "cut"
  set: (items: FileRef[], mode: "copy" | "cut") => void
  clear: () => void
}

/** In-app file clipboard, shared across Files windows. */
export const useClipboard = create<ClipboardStore>((set) => ({
  items: [],
  mode: "copy",
  set: (items, mode) => set({ items, mode }),
  clear: () => set({ items: [] }),
}))
