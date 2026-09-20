import { useState } from "react"

import { describeKind } from "@/apps/files/paths"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatBytes, formatDate } from "@/lib/format"
import { useFileInfo } from "@/services/queries"
import type { FileRef } from "@/types/api"

export function InfoDialog({ target, onClose }: { target: FileRef | null; onClose: () => void }) {
  const [calc, setCalc] = useState(false)
  const { data: info, isFetching } = useFileInfo(target, calc)

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setCalc(false); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="break-all">{info?.name ?? "Properties"}</DialogTitle></DialogHeader>
        {info && (
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">Kind</dt><dd>{describeKind(info.name, info.kind)}</dd>
            <dt className="text-muted-foreground">Where</dt><dd className="font-mono text-xs break-all">{info.location}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>
              {info.isDir ? (
                info.totalSize !== undefined ? (
                  <>{formatBytes(info.totalSize)}{info.partial && " (partial)"}</>
                ) : (
                  <Button size="xs" variant="secondary" disabled={isFetching} onClick={() => setCalc(true)}>{isFetching && calc ? "Calculating…" : "Calculate"}</Button>
                )
              ) : formatBytes(info.size)}
            </dd>
            {info.isDir && <><dt className="text-muted-foreground">Contains</dt><dd>{info.items ?? 0} items</dd></>}
            <dt className="text-muted-foreground">Modified</dt><dd>{formatDate(info.modTime)}</dd>
            <dt className="text-muted-foreground">Permissions</dt><dd className="font-mono text-xs">{info.mode}</dd>
            <dt className="text-muted-foreground">Owner</dt><dd>{info.owner}:{info.group}</dd>
            {info.mime && <><dt className="text-muted-foreground">MIME type</dt><dd className="font-mono text-xs">{info.mime}</dd></>}
            {info.symlink && <><dt className="text-muted-foreground">Link</dt><dd>Symbolic link</dd></>}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
