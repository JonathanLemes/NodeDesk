import type { DesktopAppDefinition } from "@/apps/sdk"

// Every `src/apps/<name>/app.tsx` registers a desktop application.
const modules = import.meta.glob<{ default: DesktopAppDefinition }>("./*/app.tsx", { eager: true })

const byId = new Map<string, DesktopAppDefinition>()
for (const m of Object.values(modules)) if (m.default) byId.set(m.default.id, m.default)

export const desktopApps = [...byId.values()]
export const dockApps = desktopApps.filter((a) => a.dockOrder !== undefined).sort((a, b) => a.dockOrder! - b.dockOrder!)
export const getDesktopApp = (id: string) => byId.get(id)
