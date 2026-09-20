import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { FolderGlyph } from "@/apps/icons"
import { KindGlyph } from "@/apps/files/FileIcon"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatBytes, formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { errorMessage, filesApi, useTrash } from "@/services/queries"
import type { TrashItem } from "@/types/api"

const key = (t: TrashItem) => `${t.root}:${t.id}`

export function TrashView() {
  const { data: items, isLoading } = useTrash()
  const qc = useQueryClient()
  const [sel, setSel] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ item?: TrashItem } | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ["files"] })
  const restore = async (t: TrashItem) => {
    try { await filesApi.restore(t.root, t.id); toast.success(`Restored “${t.name}”`); refresh() } catch (e) { toast.error(errorMessage(e)) }
  }
  const purge = async (t?: TrashItem) => {
    try { await filesApi.purge(t?.root, t?.id); refresh() } catch (e) { toast.error(errorMessage(e)) }
  }

  if (!isLoading && (!items || items.length === 0)) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Trash2 /></EmptyMedia>
          <EmptyTitle>Trash is empty</EmptyTitle>
          <EmptyDescription>Items you delete from Files wait here until you empty the trash.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const selected = items?.find((t) => key(t) === sel)
  return (
    <div className="flex h-full flex-col" onClick={() => setSel(null)}>
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-2">
        <span className="flex-1 text-[13px] text-muted-foreground">{items?.length ?? 0} item{items?.length === 1 ? "" : "s"}</span>
        <Button size="sm" variant="secondary" disabled={!selected} onClick={(e) => { e.stopPropagation(); selected && restore(selected) }}>Restore</Button>
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setConfirm({}) }}>Empty Trash</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items?.map((t) => (
          <ContextMenu key={key(t)}>
            <ContextMenuTrigger asChild>
              <div
                onClick={(e) => { e.stopPropagation(); setSel(key(t)) }}
                onContextMenu={() => setSel(key(t))}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px]", key(t) === sel ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.04]")}
              >
                <div className="grid size-7 place-items-center">{t.isDir ? <FolderGlyph size={26} /> : <KindGlyph kind={t.kind} size={24} />}</div>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className={cn("hidden w-56 truncate text-xs sm:block", key(t) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{t.rootName}{t.originalPath}</span>
                <span className={cn("w-36 text-xs", key(t) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatDate(t.deletedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className={cn("w-16 text-right text-xs tabular-nums", key(t) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{t.isDir ? "—" : formatBytes(t.size)}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => restore(t)}>Restore</ContextMenuItem>
              <ContextMenuItem variant="destructive" onSelect={() => setConfirm({ item: t })}>Delete Permanently…</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.item ? `Delete “${confirm.item.name}” permanently?` : "Empty the Trash?"}</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => purge(confirm?.item)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
