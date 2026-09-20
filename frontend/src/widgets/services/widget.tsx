import { Box } from "lucide-react"

import { AppIcon } from "@/components/AppIcon"
import { StatusDot, STATUS_LABEL } from "@/components/StatusDot"
import { resolveUrl } from "@/lib/format"
import { useApps } from "@/services/queries"
import { launch } from "@/windows/launch"
import { defineWidget, type WidgetProps } from "@/widgets/sdk"
import { WidgetPanel } from "@/widgets/WidgetPanel"

function Services({ settings, size }: WidgetProps) {
  const { data } = useApps()
  const count = Math.max(1, Math.min(10, Number(settings.count ?? 4)))
  const onlyFavorites = settings.source === "favorites"
  const rowH = 44
  const fit = Math.max(1, Math.floor((size.h - 66) / rowH))

  const apps = (data ?? [])
    .filter((a) => (onlyFavorites ? a.favorite : true))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .slice(0, Math.min(count, fit))

  return (
    <WidgetPanel icon={Box} title="Services" onOpen={() => launch("apps")}>
      {apps.length === 0 ? (
        <div className="flex flex-col items-center gap-2 pt-5 text-center text-[13px] text-muted-foreground">
          {data ? "No apps yet" : "Loading…"}
          {data && (
            <button onClick={() => launch("apps", { tab: "discover" })} className="text-primary hover:underline">
              Add your services
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {apps.map((a) => (
            <li key={a.id}>
              <button
                disabled={!a.url}
                onClick={() => window.open(resolveUrl(a.url), "_blank", "noopener")}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors enabled:hover:bg-foreground/6"
              >
                <AppIcon name={a.name} icon={a.icon} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{a.name}</span>
                <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <StatusDot status={a.status} />
                  {STATUS_LABEL[a.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetPanel>
  )
}

export default defineWidget({
  id: "services",
  name: "Services",
  description: "Your apps and whether they are running.",
  icon: Box,
  component: Services,
  defaultSize: { w: 348, h: 250 },
  minSize: { w: 300, h: 140 },
  maxSize: { w: 520, h: 560 },
  addByDefault: true,
  settings: [
    { key: "count", label: "Apps shown", type: "number", default: 4, min: 1, max: 10 },
    {
      key: "source", label: "Show", type: "select", default: "all",
      options: [{ value: "all", label: "All apps" }, { value: "favorites", label: "Favorites only" }],
    },
  ],
})
