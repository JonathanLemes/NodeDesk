import { useState } from "react"

import { describeKind } from "@/apps/files/paths"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatBytes, formatDate } from "@/lib/format"
import { useFileInfo } from "@/services/queries"
import type { FileRef } from "@/types/api"
import { t } from "@/i18n"

export function InfoDialog({ target, onClose }: { target: FileRef | null; onClose: () => void }) {
  const [calc, setCalc] = useState(false)
  const { data: info, isFetching } = useFileInfo(target, calc)

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setCalc(false); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="break-all">{info?.name ?? t("files.properties")}</DialogTitle></DialogHeader>
        {info && (
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-muted-foreground">{t("files.col_kind")}</dt><dd>{describeKind(info.name, info.kind)}</dd>
            <dt className="text-muted-foreground">{t("files.where")}</dt><dd className="font-mono text-xs break-all">{info.location}</dd>
            <dt className="text-muted-foreground">{t("files.col_size")}</dt>
            <dd>
              {info.isDir ? (
                info.totalSize !== undefined ? (
                  <>{formatBytes(info.totalSize)}{info.partial && t("files.partial")}</>
                ) : (
                  <Button size="xs" variant="secondary" disabled={isFetching} onClick={() => setCalc(true)}>{isFetching && calc ? t("files.calculating") : t("files.calculate")}</Button>
                )
              ) : formatBytes(info.size)}
            </dd>
            {info.isDir && <><dt className="text-muted-foreground">{t("files.contains")}</dt><dd>{t("files.items", { count: info.items ?? 0 })}</dd></>}
            <dt className="text-muted-foreground">{t("files.col_modified")}</dt><dd>{formatDate(info.modTime)}</dd>
            <dt className="text-muted-foreground">{t("files.permissions")}</dt><dd className="font-mono text-xs">{info.mode}</dd>
            <dt className="text-muted-foreground">{t("files.owner")}</dt><dd>{info.owner}:{info.group}</dd>
            {info.mime && <><dt className="text-muted-foreground">{t("files.mime")}</dt><dd className="font-mono text-xs">{info.mime}</dd></>}
            {info.symlink && <><dt className="text-muted-foreground">{t("files.link")}</dt><dd>{t("files.symlink")}</dd></>}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
