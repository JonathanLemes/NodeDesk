import { useQueryClient } from "@tanstack/react-query"
import { Check, Copy, Laptop, Monitor, Share2, TriangleAlert } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { baseName } from "@/apps/files/paths"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { copyText } from "@/lib/clipboard"
import { errorMessage, sharesApi, useShares } from "@/services/queries"
import type { FileRef, ShareStatus } from "@/types/api"
import { t } from "@/i18n"

/** Share names Samba, Windows and macOS all accept (mirrors the backend check). */
function suggestName(path: string, rootName: string): string {
  const raw = path === "/" ? rootName : baseName(path)
  return raw.replace(/[^\p{L}\p{N} ._'()&-]/gu, "").replace(/^[^\p{L}\p{N}]+/u, "").trim().slice(0, 80) || "Share"
}

/** `wrap` shows long values (commands) on several lines instead of truncating them. */
function CopyLine({ value, wrap = false }: { value: string; wrap?: boolean }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    if (await copyText(value)) {
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    } else toast.error(t("share.copy_failed"))
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2.5">
      <code data-selectable className={wrap ? "min-w-0 flex-1 font-mono text-[12px] break-all whitespace-pre-wrap" : "min-w-0 flex-1 truncate font-mono text-[12.5px]"}>{value}</code>
      <Button size="icon-xs" variant="ghost" onClick={copy} aria-label={t("edit.copy")}>
        {done ? <Check className="text-emerald-500" /> : <Copy />}
      </Button>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </li>
  )
}

function AccessGuide({ status, name }: { status: ShareStatus; name: string }) {
  const host = status.hostname
  const lan = status.addresses.filter((a) => !a.tailscale)
  const tail = status.addresses.filter((a) => a.tailscale)
  const winPaths = [`\\\\${host}\\${name}`, ...lan.map((a) => `\\\\${a.ip}\\${name}`)]
  const macPaths = [`smb://${host}.local/${encodeURIComponent(name)}`, ...lan.map((a) => `smb://${a.ip}/${encodeURIComponent(name)}`)]
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent)

  return (
    <Tabs defaultValue={isMac ? "mac" : "windows"} className="min-w-0 gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="windows"><Monitor />Windows</TabsTrigger>
        <TabsTrigger value="mac"><Laptop />macOS</TabsTrigger>
      </TabsList>

      <TabsContent value="windows" className="min-w-0">
        <ol className="space-y-3 text-[13px]">
          <Step n={1}><p>{t("share.win_step1")}</p></Step>
          <Step n={2}>
            <p>{t("share.win_step2")}</p>
            {winPaths.map((p) => <CopyLine key={p} value={p} />)}
            <p className="text-xs text-muted-foreground">{t("share.ip_hint")}</p>
          </Step>
          <Step n={3}><p>{t("share.win_step3")}</p></Step>
        </ol>
        <details className="mt-3 min-w-0 rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">{t("share.win_blocked_title")}</summary>
          <p className="mt-2">{t("share.win_blocked_body")}</p>
          <div className="mt-2"><CopyLine value="Set-SmbClientConfiguration -EnableInsecureGuestLogons $true -RequireSecuritySignature $false -Force" wrap /></div>
        </details>
      </TabsContent>

      <TabsContent value="mac" className="min-w-0">
        <ol className="space-y-3 text-[13px]">
          <Step n={1}><p>{t("share.mac_step1")}</p></Step>
          <Step n={2}>
            <p>{t("share.mac_step2")}</p>
            {macPaths.map((p) => <CopyLine key={p} value={p} />)}
            <p className="text-xs text-muted-foreground">{t("share.ip_hint")}</p>
          </Step>
          <Step n={3}><p>{t("share.mac_step3")}</p></Step>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{t("share.mac_sidebar", { host })}</p>
      </TabsContent>

      {tail.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("share.tailscale", { ips: tail.map((a) => a.ip).join(", ") })}
        </p>
      )}
    </Tabs>
  )
}

export function ShareDialog({ target, rootName, onClose }: { target: FileRef | null; rootName: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: status, isLoading } = useShares(!!target)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const current = status?.shares.find((s) => target && s.root === target.root && s.path === target.path)
  const folder = target ? (target.path === "/" ? rootName : baseName(target.path)) : ""

  useEffect(() => {
    if (target) setName(suggestName(target.path, rootName))
  }, [target, rootName])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ["shares"] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const share = () => target && run(() => sharesApi.add(name.trim(), target.root, target.path))
  const stop = () => current && run(async () => {
    await sharesApi.remove(current.name)
    toast.success(t("share.stopped", { name: current.name }))
  })

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="size-4" />{t("share.title")}</DialogTitle>
          <DialogDescription className="break-all">{folder}</DialogDescription>
        </DialogHeader>

        {isLoading || !status ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : current ? (
          <div className="min-w-0 space-y-4">
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-400">
              <Check className="size-4 shrink-0" />
              <span>{t("share.shared_as", { name: current.name })}</span>
            </div>
            {!status.running && (
              <div className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{t("share.not_running")}</span>
              </div>
            )}
            <AccessGuide status={status} name={current.name} />
          </div>
        ) : !status.available ? (
          <div className="space-y-3 text-[13px]">
            <p>{status.reason === "not_installed" ? t("share.not_installed") : t("share.not_configured")}</p>
            <CopyLine value="sudo deploy/samba-setup.sh" />
            <p className="text-xs text-muted-foreground">{t("share.setup_hint")}</p>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); share() }}>
            <label className="block space-y-1.5 text-[13px]">
              <span className="font-medium">{t("share.name")}</span>
              <Input value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
              <span className="block text-xs text-muted-foreground">{t("share.name_hint")}</span>
            </label>
            <div className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-px size-4 shrink-0" />
              <span>{t("share.warning")}</span>
            </div>
          </form>
        )}

        <DialogFooter>
          {current ? (
            <>
              <Button variant="outline" className="text-destructive" disabled={busy} onClick={stop}>{t("share.stop")}</Button>
              <Button onClick={onClose}>{t("share.done")}</Button>
            </>
          ) : status?.available ? (
            <>
              <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
              <Button disabled={busy || !name.trim()} onClick={share}>{t("share.share")}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>{t("window.close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
