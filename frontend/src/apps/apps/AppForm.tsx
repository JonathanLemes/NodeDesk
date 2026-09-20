import { X } from "lucide-react"
import { useEffect, useState } from "react"

import { AppIcon } from "@/components/AppIcon"
import { LUCIDE_ICON_NAMES } from "@/components/lucideIcons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAppMutations, useContainers } from "@/services/queries"
import type { AppType, ServiceApp } from "@/types/api"
import { t } from "@/i18n"

export type Draft = Omit<ServiceApp, "id" | "order"> & { id?: string }

export const emptyDraft = (): Draft => ({
  name: "", icon: "", type: "docker", url: "", containers: [], systemdUnits: [], favorite: false, category: "", desktop: false, desktopX: -1, desktopY: -1,
})

const types = (): { value: AppType; label: string; hint: string }[] => [
  { value: "docker", label: t("appform.type_docker"), hint: t("appform.hint_docker") },
  { value: "systemd", label: t("appform.type_systemd"), hint: t("appform.hint_systemd") },
  { value: "url", label: t("appform.type_url"), hint: t("appform.hint_url") },
  { value: "manual", label: t("appform.type_manual"), hint: t("appform.hint_manual") },
]

export function AppForm({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft>(emptyDraft())
  const [units, setUnits] = useState("")
  const { data: containers } = useContainers()
  const { create, update } = useAppMutations()
  const editing = !!draft?.id

  useEffect(() => {
    if (draft) {
      setD(draft)
      setUnits(draft.systemdUnits.join(", "))
    }
  }, [draft])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }))
  const pending = create.isPending || update.isPending

  const submit = () => {
    const body = { ...d, systemdUnits: units.split(/[,\s]+/).filter(Boolean) }
    const m = editing ? update : create
    m.mutate(body as ServiceApp, { onSuccess: onClose })
  }

  const available = (containers ?? []).map((c) => c.name).filter((n) => !d.containers.includes(n))

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("appform.edit") : t("appform.add")}</DialogTitle>
          <DialogDescription>{t("appform.desc")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="flex items-end gap-3">
            <AppIcon name={d.name || "?"} icon={d.icon} size={52} />
            <Field className="flex-1">
              <FieldLabel htmlFor="app-name">{t("common.name")}</FieldLabel>
              <Input id="app-name" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Jellyfin" autoFocus />
            </Field>
          </div>

          <Field>
            <FieldLabel>{t("appform.type")}</FieldLabel>
            <Select value={d.type} onValueChange={(v) => set("type", v as AppType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{types().map((ty) => <SelectItem key={ty.value} value={ty.value}>{ty.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{types().find((ty) => ty.value === d.type)?.hint}</FieldDescription>
          </Field>

          {(d.type === "docker" || d.containers.length > 0) && (
            <Field>
              <FieldLabel>{t("appform.containers")}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {d.containers.map((c) => (
                  <span key={c} className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs">
                    {c}
                    <button aria-label={t("appform.remove_named", { name: c })} onClick={() => set("containers", d.containers.filter((x) => x !== c))} className="rounded p-0.5 hover:bg-foreground/10"><X className="size-3" /></button>
                  </span>
                ))}
              </div>
              {available.length > 0 && (
                <Select value="" onValueChange={(v) => set("containers", [...d.containers, v])}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("appform.add_container")} /></SelectTrigger>
                  <SelectContent><SelectGroup>{available.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              )}
            </Field>
          )}

          {(d.type === "systemd" || d.systemdUnits.length > 0 || units) && (
            <Field>
              <FieldLabel htmlFor="app-units">{t("appform.units")}</FieldLabel>
              <Input id="app-units" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="code-server@jlemes.service" />
              <FieldDescription>{t("appform.units_hint")}</FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="app-url">{t("appform.address")}</FieldLabel>
            <Input id="app-url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="http://{host}:8096" />
            <FieldDescription>{t("appform.address_hint")}</FieldDescription>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="app-icon">{t("appform.icon")}</FieldLabel>
              <Input id="app-icon" list="lucide-names" value={d.icon} onChange={(e) => set("icon", e.target.value)} placeholder={t("appform.icon_placeholder")} />
              <datalist id="lucide-names">{LUCIDE_ICON_NAMES.map((n) => <option key={n} value={`lucide:${n}`} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="app-cat">{t("appform.category")}</FieldLabel>
              <Input id="app-cat" value={d.category} onChange={(e) => set("category", e.target.value)} placeholder="Media" />
            </Field>
          </div>

          <Field orientation="horizontal">
            <Switch id="app-fav" checked={d.favorite} onCheckedChange={(v) => set("favorite", v)} />
            <FieldLabel htmlFor="app-fav">{t("appform.keep_dock")}</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch id="app-desk" checked={d.desktop} onCheckedChange={(v) => set("desktop", v)} />
            <FieldLabel htmlFor="app-desk">{t("appform.show_desktop")}</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={pending || !d.name.trim()} onClick={submit}>{editing ? t("common.save") : t("common.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
