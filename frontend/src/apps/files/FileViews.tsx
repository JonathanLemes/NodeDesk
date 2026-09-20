import { ArrowDown, ArrowUp } from "lucide-react"
import { useState, type DragEvent, type MouseEvent } from "react"

import { FileIcon } from "@/apps/files/FileIcon"
import { describeKind, parentOf } from "@/apps/files/paths"
import { RenameInput } from "@/apps/files/RenameInput"
import { formatBytes, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FileEntry } from "@/types/api"

export type SortKey = "name" | "size" | "modTime" | "kind"
export interface Sort { key: SortKey; dir: "asc" | "desc" }

export function sortEntries(entries: FileEntry[], sort: Sort): FileEntry[] {
  const m = sort.dir === "asc" ? 1 : -1
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let r: number
    switch (sort.key) {
      case "size": r = a.size - b.size; break
      case "modTime": r = a.modTime - b.modTime; break
      case "kind": r = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name); break
      default: r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    }
    return r * m
  })
}

export interface ViewProps {
  root: string
  entries: FileEntry[]
  selection: Set<string>
  renaming: string | null
  /** Search results show the containing folder next to the name. */
  showPath?: boolean
  onSelect: (e: MouseEvent, entry: FileEntry) => void
  onOpen: (entry: FileEntry) => void
  onRename: (entry: FileEntry, name: string | null) => void
  onDragStart: (e: DragEvent, entry: FileEntry) => void
  onDropOn: (e: DragEvent, entry: FileEntry) => void
}

const DND_TYPE = "application/x-nodedesk-files"

function useDropTarget(onDropOn: ViewProps["onDropOn"]) {
  const [over, setOver] = useState<string | null>(null)
  return {
    over,
    bind: (entry: FileEntry) =>
      entry.isDir
        ? {
            onDragOver: (e: DragEvent) => {
              if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes("Files")) {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = e.altKey || e.dataTransfer.types.includes("Files") ? "copy" : "move"
                setOver(entry.path)
              }
            },
            onDragLeave: () => setOver((o) => (o === entry.path ? null : o)),
            onDrop: (e: DragEvent) => {
              setOver(null)
              onDropOn(e, entry)
            },
          }
        : {},
  }
}

export function GridView(p: ViewProps) {
  const { over, bind } = useDropTarget(p.onDropOn)
  return (
    <div className="grid content-start gap-x-2 gap-y-3 p-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }} data-files-grid>
      {p.entries.map((e) => {
        const selected = p.selection.has(e.path)
        const renaming = p.renaming === e.path
        return (
          <div
            key={e.path}
            data-path={e.path}
            draggable={!renaming}
            onDragStart={(ev) => p.onDragStart(ev, e)}
            onClick={(ev) => p.onSelect(ev, e)}
            onDoubleClick={() => p.onOpen(e)}
            {...bind(e)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-1.5 pt-2 pb-1.5 text-center outline-none transition-colors",
              selected ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.035]",
              over === e.path && "bg-primary/15 ring-2 ring-primary",
              e.hidden && "opacity-60",
            )}
          >
            <FileIcon entry={e} root={p.root} size={72} />
            {renaming ? (
              <RenameInput initial={e.name} isDir={e.isDir} onCommit={(n) => p.onRename(e, n)} onCancel={() => p.onRename(e, null)} />
            ) : (
              <span className={cn("line-clamp-2 max-w-full rounded-[5px] px-1.5 text-[12.5px] leading-tight font-medium break-all", selected && "bg-primary text-primary-foreground")}>
                {e.name}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {p.showPath ? parentOf(e.path) : e.isDir ? (e.items === undefined ? "" : `${e.items} item${e.items === 1 ? "" : "s"}`) : formatBytes(e.size)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface ListViewProps extends ViewProps {
  sort: Sort
  onSort: (key: SortKey) => void
}

export function ListView(p: ListViewProps) {
  const { over, bind } = useDropTarget(p.onDropOn)
  const head = (k: SortKey, label: string, className?: string) => (
    <button onClick={() => p.onSort(k)} className={cn("flex items-center gap-1 text-left hover:text-foreground", className)}>
      {label}
      {p.sort.key === k && (p.sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  )
  return (
    <div className="min-w-[520px] text-[13px]">
      <div className="sticky top-0 z-[1] flex items-center gap-3 border-b border-border/70 bg-background/95 px-5 py-1.5 text-[11.5px] font-medium text-muted-foreground backdrop-blur">
        {head("name", "Name", "flex-1")}
        {head("modTime", "Modified", "w-36")}
        {head("size", "Size", "w-20 justify-end")}
        {head("kind", "Kind", "w-32")}
      </div>
      <div className="p-2">
        {p.entries.map((e) => {
          const selected = p.selection.has(e.path)
          const renaming = p.renaming === e.path
          return (
            <div
              key={e.path}
              data-path={e.path}
              draggable={!renaming}
              onDragStart={(ev) => p.onDragStart(ev, e)}
              onClick={(ev) => p.onSelect(ev, e)}
              onDoubleClick={() => p.onOpen(e)}
              {...bind(e)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-1 outline-none",
                selected ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.04]",
                over === e.path && "bg-primary/15 ring-2 ring-primary",
                e.hidden && !selected && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <FileIcon entry={e} root={p.root} size={26} thumbnail={false} />
                {renaming ? (
                  <RenameInput initial={e.name} isDir={e.isDir} onCommit={(n) => p.onRename(e, n)} onCancel={() => p.onRename(e, null)}
                    className="w-full max-w-xs rounded-[5px] border border-primary bg-background px-1 py-0.5 text-[13px] text-foreground outline-none ring-2 ring-primary/30" />
                ) : (
                  <span className="truncate">{e.name}</span>
                )}
                {p.showPath && <span className={cn("truncate text-xs", selected ? "text-primary-foreground/70" : "text-muted-foreground")}>{parentOf(e.path)}</span>}
              </div>
              <span className={cn("w-36 shrink-0 text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatDate(e.modTime, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              <span className={cn("w-20 shrink-0 text-right text-xs tabular-nums", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{e.isDir ? "—" : formatBytes(e.size)}</span>
              <span className={cn("w-32 shrink-0 truncate text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{describeKind(e.name, e.kind)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { DND_TYPE }
