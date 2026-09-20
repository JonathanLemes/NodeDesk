import { Check, CircleAlert, Loader2, X } from "lucide-react"
import { useEffect } from "react"

import { Meter } from "@/components/Meter"
import { formatBytes } from "@/lib/format"
import { useUploads } from "@/apps/files/uploads"
import { t } from "@/i18n"

export function UploadTray() {
  const items = useUploads((s) => s.items)
  const clear = useUploads((s) => s.clearFinished)

  // Successful batches dismiss themselves; failures stay until closed.
  const settled = items.length > 0 && items.every((i) => i.status === "done")
  useEffect(() => {
    if (!settled) return
    const t = window.setTimeout(clear, 3500)
    return () => window.clearTimeout(t)
  }, [settled, clear])

  if (items.length === 0) return null

  const total = items.reduce((n, i) => n + i.size, 0)
  const loaded = items.reduce((n, i) => n + (i.status === "done" ? i.size : i.loaded), 0)
  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length
  const failed = items.filter((i) => i.status === "error")

  return (
    <div className="glass-strong absolute right-4 bottom-4 z-10 w-72 rounded-xl p-3 text-[13px] animate-[pop-in_0.18s_ease-out]">
      <div className="flex items-center gap-2">
        {active > 0 ? <Loader2 className="size-4 animate-spin text-primary" /> : failed.length ? <CircleAlert className="size-4 text-destructive" /> : <Check className="size-4 text-[var(--ok)]" />}
        <span className="flex-1 font-medium">
          {active > 0 ? t("upload.uploading", { count: active }) : failed.length ? t("upload.n_failed", { count: failed.length }) : t("upload.complete")}
        </span>
        {active === 0 && <button aria-label={t("common.dismiss")} onClick={clear} className="rounded p-0.5 hover:bg-foreground/10"><X className="size-3.5" /></button>}
      </div>
      <Meter value={total ? (loaded / total) * 100 : 0} className="mt-2" height={4} />
      <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{t("upload.progress", { loaded: formatBytes(loaded), total: formatBytes(total) })}</p>
      {failed.slice(0, 2).map((f) => <p key={f.id} className="mt-1 truncate text-xs text-destructive">{f.name}: {f.error}</p>)}
    </div>
  )
}
