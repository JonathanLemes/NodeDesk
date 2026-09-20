import { lazy } from "react"

import { FilesIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"

export default defineDesktopApp({
  id: "files",
  title: "Files",
  icon: (size) => <FilesIcon size={size} />,
  component: lazy(() => import("./FilesApp")),
  defaultSize: { w: 980, h: 620 },
  minSize: { w: 520, h: 360 },
  dockOrder: 2,
})
