import { useWindows, type Geometry } from "@/stores/windows"
import { getDesktopApp } from "@/apps/registry"

export const MENUBAR_HEIGHT = 32
export const DOCK_RESERVE = 116

const geomKey = (appId: string) => `nodedesk.win.${appId}`

function savedGeometry(appId: string): Geometry | null {
  try {
    const raw = localStorage.getItem(geomKey(appId))
    if (raw) return JSON.parse(raw) as Geometry
  } catch {
    /* ignore */
  }
  return null
}

export function saveGeometry(appId: string, g: Geometry) {
  try {
    localStorage.setItem(geomKey(appId), JSON.stringify(g))
  } catch {
    /* ignore */
  }
}

let counter = 0

/** Opens (or focuses) a window for a desktop app. Returns the window id. */
export function launch(appId: string, props?: Record<string, unknown>, opts?: { forceNew?: boolean; title?: string }): string | null {
  const app = getDesktopApp(appId)
  if (!app) return null
  const store = useWindows.getState()

  if (app.singleton && !opts?.forceNew) {
    const existing = store.windows.find((w) => w.appId === appId)
    if (existing) {
      if (props) store.setProps(existing.id, props)
      store.focus(existing.id)
      return existing.id
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const saved = app.singleton ? savedGeometry(appId) : null
  const w = Math.min(saved?.w ?? app.defaultSize.w, vw - 24)
  const h = Math.min(saved?.h ?? app.defaultSize.h, vh - MENUBAR_HEIGHT - 24)
  const cascade = (store.windows.filter((x) => x.appId === appId).length % 8) * 28
  const x = Math.max(8, Math.min(saved?.x ?? Math.round((vw - w) / 2) + cascade + 60, vw - w - 8))
  const y = Math.max(MENUBAR_HEIGHT + 8, Math.min(saved?.y ?? Math.round((vh - h - DOCK_RESERVE / 2) / 2) + cascade, vh - h - 8))

  const id = `${appId}-${++counter}-${Date.now().toString(36)}`
  return store.open({ id, appId, x, y, w, h, title: opts?.title, props })
}
