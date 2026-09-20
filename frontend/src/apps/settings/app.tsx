import { lazy } from "react"

import { SettingsIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "settings",
  get title() {
    return t("app.settings")
  },
  icon: (size) => <SettingsIcon size={size} />,
  component: lazy(() => import("./SettingsApp")),
  defaultSize: { w: 760, h: 520 },
  minSize: { w: 520, h: 360 },
  dockOrder: 6,
})
