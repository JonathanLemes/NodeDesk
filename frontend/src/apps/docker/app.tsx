import { lazy } from "react"

import { DockerIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"

export default defineDesktopApp({
  id: "docker",
  title: "Docker",
  icon: (size) => <DockerIcon size={size} />,
  component: lazy(() => import("./DockerApp")),
  defaultSize: { w: 960, h: 640 },
  minSize: { w: 520, h: 360 },
  dockOrder: 1,
})
