import { MoreHorizontal } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { FileIcon } from "@/apps/files/FileIcon"
import { describeKind } from "@/apps/files/paths"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatBytes, formatDate } from "@/lib/format"
import { fileUrl } from "@/services/queries"
import type { FileEntry } from "@/types/api"

interface PreviewPaneProps {
  root: string
  selected: FileEntry[]
  folderName: string
  folderItems: number
  onOpen: (e: FileEntry) => void
  onDownload: (e: FileEntry[]) => void
  menu: ReactNode
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  )
}

export function PreviewPane({ root, selected, folderName, folderItems, onOpen, onDownload, menu }: PreviewPaneProps) {
  const one = selected.length === 1 ? selected[0] : null
  const [dims, setDims] = useState<string | null>(null)
  useEffect(() => setDims(null), [one?.path])

  return (
    <aside className="flex w-[262px] shrink-0 flex-col border-l border-border/70 px-4 pt-3 pb-4">
      <div className="flex h-7 justify-end">
        {selected.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" onCloseAutoFocus={(e) => e.preventDefault()}>{menu}</DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {one ? (
        <div className="flex min-h-0 flex-1 flex-col animate-[fade-in_0.15s]">
          <div className="grid h-[172px] place-items-center overflow-hidden rounded-md">
            {one.kind === "image" && one.size < 20 * 1024 * 1024 ? (
              <img
                src={fileUrl.raw(root, one.path)} alt={one.name} draggable={false}
                onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
                className="max-h-full max-w-full rounded-md object-contain shadow-[0_0_0_0.5px_oklch(0_0_0/0.15)]"
              />
            ) : (
              <FileIcon entry={one} root={root} size={130} />
            )}
          </div>
          <h3 className="mt-4 text-[15px] leading-tight font-semibold break-all">{one.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {describeKind(one.name, one.kind)}{!one.isDir && ` • ${formatBytes(one.size)}`}
          </p>
          <dl className="mt-4 divide-y divide-border/70 border-t border-border/70">
            <Row label="Modified">{formatDate(one.modTime)}</Row>
            {one.isDir && one.items !== undefined && <Row label="Contains">{one.items} item{one.items === 1 ? "" : "s"}</Row>}
            {dims && <Row label="Dimensions">{dims}</Row>}
            <Row label="Permissions"><span className="font-mono text-xs">{one.mode}</span></Row>
          </dl>
          <div className="mt-auto flex gap-2 pt-4">
            <Button size="sm" className="flex-1" onClick={() => onOpen(one)}>{one.isDir ? "Open" : one.editable ? "Open / Edit" : "Open"}</Button>
            <Button size="sm" variant="secondary" onClick={() => onDownload([one])}>Download</Button>
          </div>
        </div>
      ) : selected.length > 1 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-[15px] font-semibold">{selected.length} items selected</p>
          <p className="text-[13px] text-muted-foreground">{formatBytes(selected.reduce((n, e) => n + (e.isDir ? 0 : e.size), 0))}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => onDownload(selected)}>Download as zip</Button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
          <p className="text-[15px] font-semibold text-foreground">{folderName}</p>
          <p className="text-[13px]">{folderItems} item{folderItems === 1 ? "" : "s"}</p>
          <p className="mt-2 text-xs">Select a file to preview it</p>
        </div>
      )}
    </aside>
  )
}
