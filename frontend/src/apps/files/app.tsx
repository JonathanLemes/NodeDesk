import { lazy } from "react"

import { FilesIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "files",
  get title() {
    return t("app.files")
  },
  icon: (size) => <FilesIcon size={size} />,
  component: lazy(() => import("./FilesApp")),
  defaultSize: { w: 980, h: 620 },
  minSize: { w: 520, h: 360 },
  dockOrder: 2,
  // Its own ‹ navigates back through folders, so closing is a ✕ on the right.
  mobileClose: "x",
})
