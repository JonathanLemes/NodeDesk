import { HardDrive, House, Folder, Trash2, Server, type LucideIcon } from "lucide-react"
import { useState, type DragEvent } from "react"

import { DND_TYPE } from "@/apps/files/FileViews"
import { baseName } from "@/apps/files/paths"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { useSystemInfo } from "@/services/queries"
import type { FileRef, FileRoot } from "@/types/api"

export type Location = { kind: "dir"; root: string; path: string } | { kind: "trash" }

interface SidebarProps {
  roots: FileRoot[]
  favorites: FileRef[]
  location: Location | null
  onNavigate: (loc: Location) => void
  onDropTo: (e: DragEvent, target: FileRef | "trash") => void
  onRemoveFavorite: (f: FileRef) => void
}

export function Sidebar({ roots, favorites, location, onNavigate, onDropTo, onRemoveFavorite }: SidebarProps) {
  const { data: info } = useSystemInfo()
  const [over, setOver] = useState<string | null>(null)

  const item = (key: string, label: string, Icon: LucideIcon, active: boolean, go: () => void, drop: FileRef | "trash", menu?: React.ReactNode, disabled?: boolean) => {
    const btn = (
      <button
        key={key}
        disabled={disabled}
        onClick={go}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(key) }
        }}
        onDragLeave={() => setOver((o) => (o === key ? null : o))}
        onDrop={(e) => { setOver(null); onDropTo(e, drop) }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13.5px] transition-colors disabled:opacity-40",
          active ? "bg-primary text-primary-foreground" : "hover:bg-foreground/6",
          over === key && "ring-2 ring-primary/70",
        )}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.6} />
        <span className="truncate">{label}</span>
      </button>
    )
    if (!menu) return btn
    return (
      <ContextMenu key={key}>
        <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
        <ContextMenuContent>{menu}</ContextMenuContent>
      </ContextMenu>
    )
  }

  const here = location?.kind === "dir" ? location : null

  return (
    <aside className="flex w-[190px] shrink-0 flex-col border-r border-border/70 bg-sidebar px-2.5 pt-3 pb-2.5">
      <div className="flex flex-col gap-0.5">
        {roots.map((r, i) =>
          item(`root-${r.id}`, r.name, i === 0 && /home/i.test(r.name) ? House : r.available ? HardDrive : Server,
            !!here && here.root === r.id && here.path === "/", () => onNavigate({ kind: "dir", root: r.id, path: "/" }),
            { root: r.id, path: "/" }, undefined, !r.available),
        )}
      </div>

      {favorites.length > 0 && (
        <>
          <p className="mt-4 mb-1 px-3 text-[11px] font-medium text-muted-foreground">Favorites</p>
          <div className="flex flex-col gap-0.5">
            {favorites.map((f) =>
              item(`fav-${f.root}-${f.path}`, baseName(f.path) || f.root, Folder, !!here && here.root === f.root && here.path === f.path,
                () => onNavigate({ kind: "dir", root: f.root, path: f.path }), f,
                <ContextMenuItem onSelect={() => onRemoveFavorite(f)}>Remove from Favorites</ContextMenuItem>),
            )}
          </div>
        </>
      )}

      <div className="mx-2 my-3 h-px bg-border/80" />
      {item("trash", "Trash", Trash2, location?.kind === "trash", () => onNavigate({ kind: "trash" }), "trash")}

      <div className="mt-auto flex items-center gap-2.5 border-t border-border/70 px-2 pt-3">
        <Server className="size-7 shrink-0 text-muted-foreground" strokeWidth={1.3} />
        <div className="min-w-0 text-[12px] leading-tight">
          <p className="truncate font-medium">{info?.hostname ?? "NodeDesk"}</p>
          <p className="truncate text-muted-foreground">{info?.ips[0] ?? ""}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--ok)]" />Online</p>
        </div>
      </div>
    </aside>
  )
}
