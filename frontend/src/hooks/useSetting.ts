import { locale } from "@/i18n"
import { useSettings, useUpdateSettings } from "@/services/queries"
import type { Settings } from "@/types/api"

export const DEFAULT_SETTINGS = {
  wallpaper: "builtin:alpine",
  "dock.size": 56,
  "dock.magnify": true,
  "desktop.watermark": true,
  "profile.name": "Admin",
  language: "auto" as "auto" | "en" | "pt",
  "files.favorites": [],
} satisfies Settings

/** Reads one setting (with its default) and returns a setter that persists to SQLite. */
export function useSetting<K extends keyof typeof DEFAULT_SETTINGS>(key: K) {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const value = (data?.[key] ?? DEFAULT_SETTINGS[key]) as NonNullable<Settings[K]>
  return [value, (v: NonNullable<Settings[K]>) => update.mutate({ [key]: v } as Settings)] as const
}

/** 24-hour clock: the user's choice, or the current language's convention until they choose. */
export function useClock24(): [boolean, (v: boolean) => void] {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const byLocale = !new Intl.DateTimeFormat(locale(), { hour: "numeric" }).resolvedOptions().hour12
  return [data?.clock24h ?? byLocale, (v) => update.mutate({ clock24h: v })]
}
