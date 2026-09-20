import { t } from "@/i18n"
import { defineShortcuts } from "@/services/shortcuts/types"

// Shell keys (Ctrl+C, Ctrl+K, Alt+B…) must reach the shell, so these use Alt+Shift, which shells
// leave alone and browsers pass through (Ctrl+T / Ctrl+W are reserved by the browser itself).
export default defineShortcuts([
  { id: "terminal.newTab", scope: "terminal", get label() { return t("shortcut.terminal_new_tab") }, keys: ["Alt+Shift+T"] },
  { id: "terminal.closeTab", scope: "terminal", get label() { return t("shortcut.terminal_close_tab") }, keys: ["Alt+Shift+W"] },
  { id: "terminal.nextTab", scope: "terminal", get label() { return t("shortcut.terminal_next_tab") }, keys: ["Alt+Shift+ArrowRight"] },
  { id: "terminal.prevTab", scope: "terminal", get label() { return t("shortcut.terminal_prev_tab") }, keys: ["Alt+Shift+ArrowLeft"] },
  { id: "terminal.clear", scope: "terminal", get label() { return t("shortcut.terminal_clear") }, keys: ["Alt+Shift+K"], mac: ["Mod+K", "Alt+Shift+K"] },
  // Copy only claims the key when text is selected, so Ctrl+C still interrupts a program.
  { id: "terminal.copy", scope: "terminal", get label() { return t("shortcut.terminal_copy") }, keys: ["Ctrl+Shift+C"], mac: ["Mod+C"] },
  { id: "terminal.selectAll", scope: "terminal", get label() { return t("shortcut.terminal_select_all") }, keys: ["Ctrl+Shift+A"], mac: ["Mod+A"] },
  { id: "terminal.fontBigger", scope: "terminal", get label() { return t("shortcut.terminal_font_bigger") }, keys: ["Alt+Shift+="], mac: ["Mod+=", "Alt+Shift+="] },
  { id: "terminal.fontSmaller", scope: "terminal", get label() { return t("shortcut.terminal_font_smaller") }, keys: ["Alt+Shift+-"], mac: ["Mod+-", "Alt+Shift+-"] },
  { id: "terminal.fontReset", scope: "terminal", get label() { return t("shortcut.terminal_font_reset") }, keys: ["Alt+Shift+0"], mac: ["Mod+0", "Alt+Shift+0"] },
])
