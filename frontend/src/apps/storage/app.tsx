import { lazy } from "react"

import { StorageIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"

export default defineDesktopApp({
  id: "storage",
  title: "Storage",
  icon: (size) => <StorageIcon size={size} />,
  component: lazy(() => import("./StorageApp")),
  defaultSize: { w: 820, h: 560 },
  minSize: { w: 520, h: 360 },
  dockOrder: 3,
})
