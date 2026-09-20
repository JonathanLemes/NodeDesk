import { useEffect } from "react"

import { useSettings, useUpdateSettings } from "@/services/queries"
import type { Settings } from "@/types/api"

type Theme = NonNullable<Settings["theme"]>
const KEY = "nodedesk.theme"

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === "light" || v === "dark" || v === "system") return v
  } catch {
    /* storage unavailable */
  }
  return "system"
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  return t
}

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(t) === "dark")
}

export function useTheme() {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const theme: Theme = data?.theme ?? stored()

  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ignore */
    }
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const on = () => apply("system")
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [theme])

  return {
    theme,
    resolved: resolveTheme(theme),
    setTheme: (t: Theme) => update.mutate({ theme: t }),
  }
}
