import { t } from "@/i18n"
import { defineShortcuts } from "@/services/shortcuts/types"

export default defineShortcuts([
  { id: "viewer.save", scope: "viewer", get label() { return t("shortcut.viewer_save") }, keys: ["Mod+S"] },
])
