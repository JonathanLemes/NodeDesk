import { lazy } from "react"

import { StorageIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "storage",
  get title() {
    return t("app.storage")
  },
  icon: (size) => <StorageIcon size={size} />,
  component: lazy(() => import("./StorageApp")),
  defaultSize: { w: 820, h: 560 },
  minSize: { w: 520, h: 360 },
  dockOrder: 3,
})
