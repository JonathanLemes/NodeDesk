import { lazy } from "react"

import { MonitorIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "monitor",
  get title() {
    return t("app.monitor")
  },
  icon: (size) => <MonitorIcon size={size} />,
  component: lazy(() => import("./MonitorApp")),
  defaultSize: { w: 860, h: 560 },
  minSize: { w: 520, h: 360 },
  dockOrder: 4,
})
