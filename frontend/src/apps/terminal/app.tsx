import { lazy } from "react"

import { TerminalIcon } from "@/apps/icons"
import { defineDesktopApp } from "@/apps/sdk"
import { t } from "@/i18n"

export default defineDesktopApp({
  id: "terminal",
  get title() {
    return t("app.terminal")
  },
  icon: (size) => <TerminalIcon size={size} />,
  component: lazy(() => import("./TerminalApp")),
  defaultSize: { w: 780, h: 480 },
  minSize: { w: 420, h: 260 },
  dockOrder: 5,
  // Closing ends the shells, so on a phone that is an explicit ✕, not a "back" arrow.
  mobileClose: "x",
})
