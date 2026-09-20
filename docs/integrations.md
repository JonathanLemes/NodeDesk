# Adding integrations

There are three extension points, from lightest to heaviest.

## 1. A new kind of App (data only)

An **App** is anything shown as an application: `docker`, `systemd`, `url` or `manual`. Most services need no code: add them in the **Apps** window (or *Discover* containers). Containers can also describe themselves with labels, which *Discover* honours:

```yaml
labels:
  nodedesk.name: "Jellyfin"
  nodedesk.icon: "https://cdn.example.com/jellyfin.svg"   # or lucide:clapperboard
  nodedesk.url: "http://{host}:8096"
  nodedesk.category: "Media"
```

`{host}` is replaced by the hostname the browser used to reach NodeDesk.

## 2. A desktop application (a window)

Create `frontend/src/apps/<name>/app.tsx`; it is auto-registered and, with `dockOrder`, appears in the dock.

```tsx
import { lazy } from "react"
import { Camera } from "lucide-react"
import { IconTile } from "@/components/IconTile"
import { defineDesktopApp } from "@/apps/sdk"

export default defineDesktopApp({
  id: "cameras",
  title: "Cameras",
  icon: (size) => (
    <IconTile size={size} background="linear-gradient(160deg,#64748b,#334155)">
      <Camera size={size * 0.5} />
    </IconTile>
  ),
  component: lazy(() => import("./CamerasApp")),
  defaultSize: { w: 860, h: 560 },
  minSize: { w: 480, h: 320 },
  dockOrder: 6,            // omit to keep it out of the dock
})
```

Inside the component you get `{ windowId, props }`, and can:

- put controls in the title bar with `<WindowToolbar>…</WindowToolbar>` (from `@/windows/context`);
- contribute File / Edit / View / Go menu items with `useAppMenus({...})` (from `@/hooks/useAppMenus`);
- open other windows with `launch("files", { root, path })` (from `@/windows/launch`).

Heavy apps are `lazy`-loaded, so they cost nothing until opened.

## 3. A backend capability

1. Create `backend/internal/<domain>/` with the logic (no HTTP in it).
2. Add `backend/internal/api/<domain>.go` with **typed** routes, register it in `api/server.go`, and wire the service in `cmd/nodedesk/main.go`.
3. Validate every input; return `httpx.BadRequest/NotFound/…` for expected failures.
4. If it needs storage, add a numbered SQL file to `internal/database/migrations/` (never edit an applied one).
5. Add tests for anything security-relevant, and document new permissions in [configuration](configuration.md).

Rules of the house: no generic “run this” endpoints, no shelling out where an API exists, no background polling: sample on demand and stop when nobody is watching.
