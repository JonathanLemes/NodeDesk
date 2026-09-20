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

type Draft = Omit<ServiceApp, "id" | "order"> & { id?: string }

export const emptyDraft = (): Draft => ({
  name: "", icon: "", type: "docker", url: "", containers: [], systemdUnits: [], favorite: false, category: "",
})

const TYPES: { value: AppType; label: string; hint: string }[] = [
  { value: "docker", label: "Docker container", hint: "Controlled through the Docker API." },
  { value: "systemd", label: "systemd service", hint: "Controlled through systemd (needs permission on the host)." },
  { value: "url", label: "External URL", hint: "Just a link, no start/stop." },
  { value: "manual", label: "Manual", hint: "A card you manage yourself." },
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
          <DialogTitle>{editing ? "Edit app" : "Add app"}</DialogTitle>
          <DialogDescription>Apps appear as icons on your desktop, in the dock and in the Services widget.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="flex items-end gap-3">
            <AppIcon name={d.name || "?"} icon={d.icon} size={52} />
            <Field className="flex-1">
              <FieldLabel htmlFor="app-name">Name</FieldLabel>
              <Input id="app-name" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Jellyfin" autoFocus />
            </Field>
          </div>

          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select value={d.type} onValueChange={(v) => set("type", v as AppType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{TYPES.find((t) => t.value === d.type)?.hint}</FieldDescription>
          </Field>

          {(d.type === "docker" || d.containers.length > 0) && (
            <Field>
              <FieldLabel>Containers</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {d.containers.map((c) => (
                  <span key={c} className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs">
                    {c}
                    <button aria-label={`Remove ${c}`} onClick={() => set("containers", d.containers.filter((x) => x !== c))} className="rounded p-0.5 hover:bg-foreground/10"><X className="size-3" /></button>
                  </span>
                ))}
              </div>
              {available.length > 0 && (
                <Select value="" onValueChange={(v) => set("containers", [...d.containers, v])}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Add a container…" /></SelectTrigger>
                  <SelectContent><SelectGroup>{available.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              )}
            </Field>
          )}

          {(d.type === "systemd" || d.systemdUnits.length > 0 || units) && (
            <Field>
              <FieldLabel htmlFor="app-units">systemd units</FieldLabel>
              <Input id="app-units" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="code-server@jlemes.service" />
              <FieldDescription>Comma separated, e.g. <code>ssh.service</code>.</FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="app-url">Address</FieldLabel>
            <Input id="app-url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="http://{host}:8096" />
            <FieldDescription><code>{"{host}"}</code> is replaced by the hostname you use to reach NodeDesk, so links work on the LAN and over Tailscale.</FieldDescription>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="app-icon">Icon</FieldLabel>
              <Input id="app-icon" list="lucide-names" value={d.icon} onChange={(e) => set("icon", e.target.value)} placeholder="auto, lucide:tv or https://…" />
              <datalist id="lucide-names">{LUCIDE_ICON_NAMES.map((n) => <option key={n} value={`lucide:${n}`} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor="app-cat">Category</FieldLabel>
              <Input id="app-cat" value={d.category} onChange={(e) => set("category", e.target.value)} placeholder="Media" />
            </Field>
          </div>

          <Field orientation="horizontal">
            <Switch id="app-fav" checked={d.favorite} onCheckedChange={(v) => set("favorite", v)} />
            <FieldLabel htmlFor="app-fav">Keep in the dock</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !d.name.trim()} onClick={submit}>{editing ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
