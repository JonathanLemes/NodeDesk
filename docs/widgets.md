# Writing a widget

A widget is a React component plus a definition. Drop a folder into `frontend/src/widgets/` and it appears in **Add widget** automatically. No core change, no backend change: the layout is stored as opaque JSON.

```
frontend/src/widgets/
  clock/
    widget.tsx      ← must default-export defineWidget({...})
```

## Minimal example

```tsx
// frontend/src/widgets/clock/widget.tsx
import { Clock as ClockIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { defineWidget, type WidgetProps } from "@/widgets/sdk"
import { WidgetPanel } from "@/widgets/WidgetPanel"

function Clock({ settings }: WidgetProps) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <WidgetPanel icon={ClockIcon} title="Clock">
      <p className="text-center text-4xl font-light tabular-nums">
        {now.toLocaleTimeString([], { hour12: settings.h12 === true })}
      </p>
    </WidgetPanel>
  )
}

export default defineWidget({
  id: "clock",                       // stable: it is what the layout stores
  name: "Clock",
  description: "The current time.",
  icon: ClockIcon,
  component: Clock,
  defaultSize: { w: 348, h: 130 },
  minSize: { w: 220, h: 100 },
  settings: [{ key: "h12", label: "12-hour clock", type: "toggle", default: false }],
})
```

## The definition

| Field | |
|---|---|
| `id` | Unique and **never changed**; persisted with the layout. |
| `name`, `description`, `icon` | Shown in the gallery. `icon` is a Lucide icon component. |
| `component` | Receives `WidgetProps`. |
| `defaultSize`, `minSize`, `maxSize?` | Pixels. The user can resize between min and max. |
| `addByDefault?` | Place it on a fresh desktop (the three built-ins do). |
| `settings?` | Declarative per-instance settings (`toggle`, `number`, `select`). They get an editor in *Edit widgets* and arrive in `props.settings`. |

## `WidgetProps`

```ts
{ instanceId: string; size: {w, h}; settings: Record<string, unknown>; editing: boolean }
```

Several instances of one widget can coexist, each with its own `instanceId`, position, size and settings. `editing` is `true` while arranging; the host already disables pointer events then.

## Getting data

- **Live metrics** (1 Hz): `useMetrics((s) => s.latest?.cpu)`. It is a Zustand store fed by one shared SSE connection; select only what you need to avoid re-renders.
- **Anything else**: a TanStack Query hook. Add one in `services/queries.ts` (or your own file) against an existing endpoint; see `widgets/storage/widget.tsx`.
- Do not poll aggressively; prefer the SSE change events (`/api/events`) plus query invalidation.

## Look and feel

The host draws the glass panel and the corner radius. Use `WidgetPanel` for the standard icon + title header, semantic colours (`text-muted-foreground`, …) and the ring / meter colours (`var(--ring-cpu)`, `<Meter/>`, `<Ring/>`). Keep it sparse: a widget should read in one glance.

## Persistence

Position, size, z-order and `settings` are saved to SQLite (`widgets` table) ~0.5 s after you stop editing.
