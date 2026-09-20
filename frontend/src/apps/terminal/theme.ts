import type { ITheme } from "@xterm/xterm"

/**
 * Colours after macOS Terminal: "Basic" (white) in light mode and a "Pro"-like dark profile in
 * dark mode. ANSI red / yellow / green are what tools use for errors / warnings / success.
 */
export const TERMINAL_THEMES: Record<"light" | "dark", ITheme> = {
  light: {
    background: "#ffffff",
    foreground: "#1d1d1f",
    cursor: "#1d1d1f",
    cursorAccent: "#ffffff",
    selectionBackground: "#b3d7ff",
    selectionInactiveBackground: "#dcdcdc",
    black: "#000000", red: "#c23621", green: "#25a324", yellow: "#a58c00",
    blue: "#492ee1", magenta: "#b930b9", cyan: "#2196a8", white: "#a3a4a5",
    brightBlack: "#6d6f70", brightRed: "#e5341c", brightGreen: "#1fb51e", brightYellow: "#b58f00",
    brightBlue: "#5833ff", brightMagenta: "#d02fcf", brightCyan: "#12a5b5", brightWhite: "#5e6061",
  },
  dark: {
    background: "#151619", // = the dark window colour (--window), so the frame and the terminal are one surface
    foreground: "#e8e8ea",
    cursor: "#e8e8ea",
    cursorAccent: "#151619",
    selectionBackground: "#3a5a8c",
    selectionInactiveBackground: "#3a3a3e",
    black: "#3b3b40", red: "#ff6961", green: "#4cd964", yellow: "#ffd60a",
    blue: "#5e9bff", magenta: "#d67cff", cyan: "#5ac8fa", white: "#d8d8dc",
    brightBlack: "#7d7d85", brightRed: "#ff8b85", brightGreen: "#7be495", brightYellow: "#ffe45c",
    brightBlue: "#8ab8ff", brightMagenta: "#e5a3ff", brightCyan: "#8fdcff", brightWhite: "#ffffff",
  },
}

export const TERMINAL_FONT = "'SF Mono', Menlo, 'JetBrains Mono', 'DejaVu Sans Mono', 'Liberation Mono', ui-monospace, Consolas, monospace"

export const FONT_SIZE = { min: 9, max: 28 }
const KEY = "nodedesk.terminal.fontSize"

export function loadFontSize(mobile: boolean): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    if (n >= FONT_SIZE.min && n <= FONT_SIZE.max) return n
  } catch {
    /* storage unavailable */
  }
  return mobile ? 12 : 13
}

export function saveFontSize(n: number) {
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    /* ignore */
  }
}
