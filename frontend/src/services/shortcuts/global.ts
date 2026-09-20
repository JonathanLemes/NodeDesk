import { t } from "@/i18n"
import { defineShortcuts } from "@/services/shortcuts/types"

/** Shortcuts that work anywhere on the desktop. Each app declares its own in apps/<name>/shortcuts.ts. */
export default defineShortcuts([
  { id: "global.spotlight", scope: "global", get label() { return t("shortcut.spotlight") }, keys: ["Mod+K"] },
  { id: "global.settings", scope: "global", get label() { return t("shortcut.settings") }, keys: ["Mod+,"] },
  { id: "global.terminal", scope: "global", get label() { return t("shortcut.terminal") }, keys: ["Ctrl+`"] },
  { id: "global.exitWidgetEdit", scope: "global", get label() { return t("shortcut.exit_widget_edit") }, keys: ["Escape"], fixed: true },
])
