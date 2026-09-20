import { useEffect, useState } from "react"

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { AboutDialog } from "@/desktop/AboutDialog"
import { Dock } from "@/desktop/Dock"
import { MenuBar } from "@/desktop/MenuBar"
import { Spotlight } from "@/desktop/Spotlight"
import { WidgetLayer } from "@/desktop/WidgetLayer"
import { Wallpaper } from "@/desktop/wallpapers"
import { useLiveStreams } from "@/hooks/useLiveStreams"
import { useSetting } from "@/hooks/useSetting"
import { useUi } from "@/stores/ui"
import { launch } from "@/windows/launch"
import { WindowLayer } from "@/windows/WindowLayer"

export function Desktop({ onLock }: { onLock: () => void }) {
  useLiveStreams(true)
  const [wallpaper] = useSetting("wallpaper")
  const [watermark] = useSetting("desktop.watermark")
  const [aboutOpen, setAboutOpen] = useState(false)
  const editing = useUi((s) => s.editingWidgets)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault()
        useUi.getState().setSpotlightOpen(!useUi.getState().spotlightOpen)
      } else if (mod && e.key === ",") {
        e.preventDefault()
        launch("settings")
      } else if (e.key === "Escape" && useUi.getState().editingWidgets) {
        useUi.getState().setEditingWidgets(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Wallpaper value={wallpaper} />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="absolute inset-0" onDoubleClick={() => editing && useUi.getState().setEditingWidgets(false)}>
            {watermark && (
              <div className="pointer-events-none absolute top-[76px] right-9 text-white/55 drop-shadow-sm select-none">
                <p className="text-[30px] leading-none font-light tracking-tight">NodeDesk</p>
                <p className="mt-3 text-[15px] leading-snug text-white/50">Your Home Server<br />Everyday, Extraordinary.</p>
                <div className="mt-3 h-px w-8 bg-white/40" />
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">
          <ContextMenuItem onSelect={() => useUi.getState().setEditingWidgets(true)}>Edit Widgets</ContextMenuItem>
          <ContextMenuItem onSelect={() => useUi.getState().setWidgetGalleryOpen(true)}>Add Widget…</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => launch("settings", { section: "desktop" })}>Change Wallpaper…</ContextMenuItem>
          <ContextMenuItem onSelect={() => launch("files")}>Open Files</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <WidgetLayer />
      <WindowLayer />
      <MenuBar onLock={onLock} onAbout={() => setAboutOpen(true)} />
      <Dock />
      <Spotlight />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  )
}
