import { createContext, useContext, type ReactNode } from "react"
import { createPortal } from "react-dom"

interface WindowContextValue {
  windowId: string
  titlebar: HTMLElement | null
  focused: boolean
}

export const WindowContext = createContext<WindowContextValue | null>(null)

export function useWindowContext(): WindowContextValue {
  const ctx = useContext(WindowContext)
  if (!ctx) throw new Error("useWindowContext must be used inside a window")
  return ctx
}

/** Renders its children in the window's title bar (next to the traffic lights). */
export function WindowToolbar({ children }: { children: ReactNode }) {
  const { titlebar } = useWindowContext()
  return titlebar ? createPortal(children, titlebar) : null
}
