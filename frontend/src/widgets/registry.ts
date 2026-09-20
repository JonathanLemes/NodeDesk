import type { WidgetDefinition } from "@/widgets/sdk"

// Every `src/widgets/<name>/widget.tsx` is picked up here. Order is alphabetical by folder,
// unless a definition sorts itself otherwise via `addByDefault`.
const modules = import.meta.glob<{ default: WidgetDefinition }>("./*/widget.{ts,tsx}", { eager: true })

const definitions = Object.values(modules)
  .map((m) => m.default)
  .filter(Boolean)

const byId = new Map<string, WidgetDefinition>()
for (const def of definitions) {
  if (byId.has(def.id)) console.warn(`[widgets] duplicate widget id "${def.id}" ignored`)
  else byId.set(def.id, def)
}

const ORDER = ["system", "storage", "services"]

export const widgetList: WidgetDefinition[] = [...byId.values()].sort((a, b) => {
  const ai = ORDER.indexOf(a.id)
  const bi = ORDER.indexOf(b.id)
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  return a.name.localeCompare(b.name)
})

export const getWidget = (id: string) => byId.get(id)
