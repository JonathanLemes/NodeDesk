import { Database, HardDrive } from "lucide-react"

import { Meter } from "@/components/Meter"
import { useStorage } from "@/services/queries"
import { launch } from "@/windows/launch"
import { defineWidget, type WidgetProps } from "@/widgets/sdk"
import { WidgetPanel } from "@/widgets/WidgetPanel"
import { formatCapacity } from "@/lib/format"
import { t } from "@/i18n"

const BAR_COLORS = [
  "linear-gradient(90deg, oklch(0.72 0.15 245), oklch(0.62 0.19 259))",
  "linear-gradient(90deg, oklch(0.72 0.17 300), oklch(0.62 0.2 300))",
  "linear-gradient(90deg, oklch(0.8 0.17 150), oklch(0.7 0.19 148))",
  "linear-gradient(90deg, oklch(0.82 0.15 75), oklch(0.75 0.17 60))",
]

function Storage({ settings, size }: WidgetProps) {
  const { data } = useStorage()
  const count = Math.max(1, Math.min(8, Number(settings.count ?? 3)))
  const showTemp = settings.temp === true

  const mounts = (data?.mounts ?? [])
    .filter((m) => !m.mountpoint.startsWith("/boot"))
    .sort((a, b) => (a.mountpoint === "/" ? -1 : b.mountpoint === "/" ? 1 : b.total - a.total))
    .slice(0, count)
  const rowH = 58
  const fit = Math.max(1, Math.floor((size.h - 66) / rowH))

  return (
    <WidgetPanel icon={Database} title={t("widget.storage.name")} onOpen={() => launch("storage")}>
      {mounts.length === 0 ? (
        <p className="pt-6 text-center text-[13px] text-muted-foreground">{data ? t("widget.storage.none") : t("common.loading")}</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {mounts.slice(0, Math.max(fit, 1)).map((m, i) => (
            <li key={m.mountpoint} className="flex items-center gap-3">
              <HardDrive className="size-9 shrink-0 text-foreground/55" strokeWidth={1.2} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-medium">{m.mountpoint === "/" && m.name === "System" ? t("storage.system") : m.name}</span>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
                    {formatCapacity(m.used)} / {formatCapacity(m.total)}
                    {showTemp && m.temp !== undefined && ` · ${Math.round(m.temp)}°`}
                  </span>
                </div>
                <Meter value={m.percent} color={BAR_COLORS[i % BAR_COLORS.length]} className="mt-1.5" />
              </div>
              <span className="w-10 shrink-0 text-right text-[14px] text-foreground/80 tabular-nums">{Math.round(m.percent)}%</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetPanel>
  )
}

export default defineWidget({
  id: "storage",
  get name() {
    return t("widget.storage.name")
  },
  get description() {
    return t("widget.storage.desc")
  },
  icon: Database,
  component: Storage,
  defaultSize: { w: 348, h: 232 },
  minSize: { w: 300, h: 140 },
  maxSize: { w: 520, h: 520 },
  addByDefault: true,
  settings: [
    { key: "count", get label() { return t("widget.storage.count") }, type: "number", default: 3, min: 1, max: 8 },
    { key: "temp", get label() { return t("widget.storage.temp") }, type: "toggle", default: false },
  ],
})
