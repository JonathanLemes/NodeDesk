import { useEffect } from "react"

import { useMenus, type AppMenus } from "@/stores/menus"
import { useWindowContext } from "@/windows/context"

/** Contributes File/Edit/View/Go items to the menu bar while this window is focused. */
export function useAppMenus(menus: AppMenus) {
  const { windowId } = useWindowContext()
  const register = useMenus((s) => s.register)
  const unregister = useMenus((s) => s.unregister)
  useEffect(() => {
    register(windowId, menus)
  })
  useEffect(() => () => unregister(windowId), [windowId, unregister])
}
