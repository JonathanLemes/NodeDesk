import { useSettings, useUpdateSettings } from "@/services/queries"
import type { Settings } from "@/types/api"

export const DEFAULT_SETTINGS = {
  wallpaper: "builtin:alpine",
  "dock.size": 56,
  "dock.magnify": true,
  clock24h: false,
  "desktop.watermark": true,
  "profile.name": "Admin",
  "files.favorites": [],
} satisfies Settings

/** Reads one setting (with its default) and returns a setter that persists to SQLite. */
export function useSetting<K extends keyof typeof DEFAULT_SETTINGS>(key: K) {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const value = (data?.[key] ?? DEFAULT_SETTINGS[key]) as NonNullable<Settings[K]>
  return [value, (v: NonNullable<Settings[K]>) => update.mutate({ [key]: v } as Settings)] as const
}
