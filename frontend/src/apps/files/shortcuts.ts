import { t } from "@/i18n"
import { defineShortcuts } from "@/services/shortcuts/types"

// Only active while a Files window has focus and the keys are typed in its file area.
export default defineShortcuts([
  { id: "files.open", scope: "files", get label() { return t("shortcut.files_open") }, keys: ["Enter"] },
  { id: "files.rename", scope: "files", get label() { return t("shortcut.files_rename") }, keys: ["F2"] },
  { id: "files.copy", scope: "files", get label() { return t("shortcut.files_copy") }, keys: ["Mod+C"] },
  { id: "files.cut", scope: "files", get label() { return t("shortcut.files_cut") }, keys: ["Mod+X"] },
  { id: "files.paste", scope: "files", get label() { return t("shortcut.files_paste") }, keys: ["Mod+V"] },
  { id: "files.selectAll", scope: "files", get label() { return t("shortcut.files_select_all") }, keys: ["Mod+A"] },
  { id: "files.trash", scope: "files", get label() { return t("shortcut.files_trash") }, keys: ["Delete", "Backspace"] },
  { id: "files.deletePermanently", scope: "files", get label() { return t("shortcut.files_delete_permanently") }, keys: ["Shift+Delete"] },
  { id: "files.up", scope: "files", get label() { return t("shortcut.files_up") }, keys: ["Backspace", "Mod+ArrowUp"] },
  { id: "files.clearSelection", scope: "files", get label() { return t("shortcut.files_clear_selection") }, keys: ["Escape"] },
  { id: "files.moveLeft", scope: "files", get label() { return t("shortcut.files_move_left") }, keys: ["ArrowLeft"] },
  { id: "files.moveRight", scope: "files", get label() { return t("shortcut.files_move_right") }, keys: ["ArrowRight"] },
  { id: "files.moveUp", scope: "files", get label() { return t("shortcut.files_move_up") }, keys: ["ArrowUp"] },
  { id: "files.moveDown", scope: "files", get label() { return t("shortcut.files_move_down") }, keys: ["ArrowDown"] },
])
