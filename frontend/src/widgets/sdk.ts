import type { LucideIcon } from "lucide-react"
import type { ComponentType } from "react"

export interface Size { w: number; h: number }

/** Widgets narrower than this render their compact layout (phones). */
export const COMPACT_WIDTH = 260

export interface WidgetProps {
  instanceId: string
  size: Size
  /** Per-instance settings, persisted in SQLite alongside the layout. */
  settings: Record<string, unknown>
  /** True while the user is arranging widgets (content is not interactive). */
  editing: boolean
}

export type SettingField =
  | { key: string; label: string; type: "toggle"; default: boolean }
  | { key: string; label: string; type: "number"; default: number; min?: number; max?: number }
  | { key: string; label: string; type: "select"; default: string; options: { value: string; label: string }[] }

export interface WidgetDefinition {
  /** Stable, unique id, e.g. "system". Used to persist layouts, never change it. */
  id: string
  name: string
  description?: string
  icon: LucideIcon
  component: ComponentType<WidgetProps>
  defaultSize: Size
  minSize: Size
  maxSize?: Size
  /** Widgets flagged here are placed on a fresh desktop, in registry order. */
  addByDefault?: boolean
  settings?: SettingField[]
}

/**
 * Declares a widget. Drop a folder with a `widget.tsx` that default-exports the result
 * into `src/widgets/` and it is discovered automatically, no core changes needed.
 */
export function defineWidget(def: WidgetDefinition): WidgetDefinition {
  return def
}

export function settingValue<T>(settings: Record<string, unknown>, field: SettingField): T {
  const v = settings[field.key]
  return (v === undefined ? field.default : v) as T
}
