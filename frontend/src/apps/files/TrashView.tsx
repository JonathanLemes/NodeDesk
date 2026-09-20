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
import { t } from "@/i18n"

const key = (it: TrashItem) => `${it.root}:${it.id}`

export function TrashView() {
  const { data: items, isLoading } = useTrash()
  const qc = useQueryClient()
  const [sel, setSel] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ item?: TrashItem } | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ["files"] })
  const restore = async (it: TrashItem) => {
    try { await filesApi.restore(it.root, it.id); toast.success(t("trash.restored", { name: it.name })); refresh() } catch (e) { toast.error(errorMessage(e)) }
  }
  const purge = async (it?: TrashItem) => {
    try { await filesApi.purge(it?.root, it?.id); refresh() } catch (e) { toast.error(errorMessage(e)) }
  }

  if (!isLoading && (!items || items.length === 0)) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Trash2 /></EmptyMedia>
          <EmptyTitle>{t("trash.empty")}</EmptyTitle>
          <EmptyDescription>{t("trash.empty_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const selected = items?.find((it) => key(it) === sel)
  return (
    <div className="flex h-full flex-col" onClick={() => setSel(null)}>
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-2">
        <span className="flex-1 text-[13px] text-muted-foreground">{items?.length ?? 0} item{items?.length === 1 ? "" : "s"}</span>
        <Button size="sm" variant="secondary" disabled={!selected} onClick={(e) => { e.stopPropagation(); if (selected) restore(selected) }}>{t("trash.restore")}</Button>
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setConfirm({}) }}>{t("trash.empty_action")}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items?.map((it) => (
          <ContextMenu key={key(it)}>
            <ContextMenuTrigger asChild>
              <div
                onClick={(e) => { e.stopPropagation(); setSel(key(it)) }}
                onContextMenu={() => setSel(key(it))}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px]", key(it) === sel ? "bg-primary text-primary-foreground" : "hover:bg-foreground/[0.04]")}
              >
                <div className="grid size-7 place-items-center">{it.isDir ? <FolderGlyph size={26} /> : <KindGlyph kind={it.kind} size={24} />}</div>
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className={cn("hidden w-56 truncate text-xs sm:block", key(it) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{it.rootName}{it.originalPath}</span>
                <span className={cn("w-36 text-xs", key(it) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatDate(it.deletedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className={cn("w-16 text-right text-xs tabular-nums", key(it) === sel ? "text-primary-foreground/80" : "text-muted-foreground")}>{it.isDir ? "—" : formatBytes(it.size)}</span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => restore(it)}>{t("trash.restore")}</ContextMenuItem>
              <ContextMenuItem variant="destructive" onSelect={() => setConfirm({ item: it })}>{t("files.delete_permanently")}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.item ? t("files.delete_confirm_one", { name: confirm.item.name }) : t("trash.empty_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("trash.cannot_undo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => purge(confirm?.item)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
