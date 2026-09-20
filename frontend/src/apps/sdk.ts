import type { ComponentType, LazyExoticComponent, ReactNode } from "react"

import type { Size } from "@/widgets/sdk"

export interface DesktopAppProps {
  windowId: string
  /** Data given at launch time (e.g. the file a viewer window shows). */
  props: Record<string, unknown>
}

export interface DesktopAppDefinition {
  id: string
  title: string
  /** Renders the icon at a given pixel size (dock, menus). */
  icon: (size: number) => ReactNode
  component: LazyExoticComponent<ComponentType<DesktopAppProps>> | ComponentType<DesktopAppProps>
  defaultSize: Size
  minSize: Size
  /** One window per app (default true). */
  singleton?: boolean
  /** Position in the dock; omit to keep the app out of the dock. */
  dockOrder?: number
  /**
   * How a phone closes the app. "back" (default) is a ‹ arrow on the left, like navigating back;
   * "x" is a ✕ on the right and leaves the left side to the app (its own back button, say).
   */
  mobileClose?: "back" | "x"
}

/** Mutates instead of spreading so `title` can be a getter that follows the current language. */
export const defineDesktopApp = (def: DesktopAppDefinition): DesktopAppDefinition => {
  def.singleton ??= true
  return def
}
