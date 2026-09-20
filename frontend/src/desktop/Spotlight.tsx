import { CornerDownLeft, Moon, PencilRuler, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { AppIcon } from "@/components/AppIcon"
import { dockApps } from "@/apps/registry"
import { useTheme } from "@/hooks/useTheme"
import { resolveUrl } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useApps } from "@/services/queries"
import { useUi } from "@/stores/ui"
import { launch } from "@/windows/launch"

interface Result { id: string; label: string; hint: string; icon: ReactNode; run: () => void }

/** Quick launcher (Ctrl/⌘ + K): built-in apps, your services and a few actions. */
export function Spotlight() {
  const open = useUi((s) => s.spotlightOpen)
  const setOpen = useUi((s) => s.setSpotlightOpen)
  const { data: apps } = useApps()
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      window.setTimeout(() => input.current?.focus(), 30)
    }
  }, [open])

  const all = useMemo<Result[]>(() => {
    const list: Result[] = dockApps.map((a) => ({ id: `app-${a.id}`, label: a.title, hint: "Application", icon: a.icon(30), run: () => launch(a.id) }))
    for (const a of apps ?? []) {
      list.push({
        id: `svc-${a.id}`, label: a.name, hint: a.url ? "Open service" : "Service", icon: <AppIcon name={a.name} icon={a.icon} size={30} />,
        run: () => (a.url ? window.open(resolveUrl(a.url), "_blank", "noopener") : launch("apps", { select: a.id })),
      })
    }
    list.push(
      { id: "act-theme", label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode", hint: "Action", icon: <Moon className="size-6 text-muted-foreground" />, run: () => setTheme(theme === "dark" ? "light" : "dark") },
      { id: "act-widgets", label: "Edit Widgets", hint: "Action", icon: <PencilRuler className="size-6 text-muted-foreground" />, run: () => useUi.getState().setEditingWidgets(true) },
    )
    return list
  }, [apps, theme, setTheme])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? all.filter((r) => r.label.toLowerCase().includes(q)) : all.slice(0, 8)
  }, [all, query])

  if (!open) return null
  const run = (r?: Result) => {
    if (!r) return
    setOpen(false)
    r.run()
  }

  return (
    <div className="fixed inset-0 z-[9000] flex justify-center bg-black/10 pt-[16vh] animate-[fade-in_0.12s]" onPointerDown={() => setOpen(false)}>
      <div
        className="glass-strong h-fit w-[560px] max-w-[92vw] overflow-hidden rounded-2xl animate-[pop-in_0.16s_ease-out]"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
          else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === "Enter") run(results[active])
        }}
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4">
          <Search className="size-5 text-muted-foreground" />
          <input
            ref={input}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            placeholder="Search apps and services"
            className="h-14 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul className="max-h-[340px] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results</li>}
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                onMouseMove={() => setActive(i)}
                onClick={() => run(r)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-primary text-primary-foreground")}
              >
                <span className="grid size-[30px] place-items-center">{r.icon}</span>
                <span className="flex-1 truncate text-[14.5px]">{r.label}</span>
                <span className={cn("text-xs", i === active ? "text-primary-foreground/80" : "text-muted-foreground")}>{r.hint}</span>
                {i === active && <CornerDownLeft className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
