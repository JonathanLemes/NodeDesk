import { lazy } from "react"

import { defineDesktopApp } from "@/apps/sdk"

// The file viewer/editor is opened from Files; it is not in the dock and allows many windows.
export default defineDesktopApp({
  id: "viewer",
  title: "Preview",
  icon: () => null,
  component: lazy(() => import("./ViewerApp")),
  defaultSize: { w: 820, h: 620 },
  minSize: { w: 420, h: 300 },
  singleton: false,
})
