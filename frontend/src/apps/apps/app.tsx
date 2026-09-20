import { lazy } from "react"

import { AppsIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "apps",
  get title() {
    return t("app.apps")
  },
  icon: (size) => <AppsIcon size={size} />,
  component: lazy(() => import("./AppsApp")),
  defaultSize: { w: 760, h: 520 },
  minSize: { w: 520, h: 360 },
  dockOrder: 0,
})
