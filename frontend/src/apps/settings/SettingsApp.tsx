import { useQueryClient } from "@tanstack/react-query"
import { FolderLock, Info, LayoutDashboard, Lock, Monitor, Moon, ScrollText, Settings2, Sun, Trash2, type LucideIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"

import type { DesktopAppProps } from "@/apps/sdk"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WALLPAPERS } from "@/desktop/wallpapers"
import { useSetting } from "@/hooks/useSetting"
import { useTheme } from "@/hooks/useTheme"
import { formatBytes, formatDate, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { api } from "@/services/api"
import { errorMessage, keys, useAudit, useAuth, useRoots, useRootMutations, useSystemInfo } from "@/services/queries"
import { useUi } from "@/stores/ui"
import { launch } from "@/windows/launch"

type Section = "general" | "desktop" | "files" | "security" | "activity" | "about"

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "desktop", label: "Desktop & Dock", icon: LayoutDashboard },
  { id: "files", label: "File Access", icon: FolderLock },
  { id: "security", label: "Security", icon: Lock },
  { id: "activity", label: "Activity", icon: ScrollText },
  { id: "about", label: "About", icon: Info },
]

function Group({ title, children, description }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {description && <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{description}</p>}
      <div className={cn("rounded-xl border border-border/70 p-4", !description && "mt-2")}>{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13.5px]">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function General() {
  const { theme, setTheme } = useTheme()
  const [name, setName] = useSetting("profile.name")
  const [draft, setDraft] = useState(name)
  const [h24, setH24] = useSetting("clock24h")
  useEffect(() => setDraft(name), [name])
  return (
    <>
      <Group title="Appearance">
        <Row label="Theme" hint="Auto follows your browser or operating system.">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v as typeof theme)} variant="outline" size="sm">
            <ToggleGroupItem value="light" className="gap-1.5 px-3"><Sun className="size-3.5" />Light</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="gap-1.5 px-3"><Moon className="size-3.5" />Dark</ToggleGroupItem>
            <ToggleGroupItem value="system" className="gap-1.5 px-3"><Monitor className="size-3.5" />Auto</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
      <Group title="Profile">
        <Row label="Display name" hint="Shown in the menu bar avatar.">
          <Input value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim() && draft !== name && setName(draft.trim())} className="h-8 w-48" />
        </Row>
        <Row label="24-hour clock"><Switch checked={h24} onCheckedChange={setH24} /></Row>
      </Group>
    </>
  )
}

function Desktop() {
  const [wallpaper, setWallpaper] = useSetting("wallpaper")
  const [size, setSize] = useSetting("dock.size")
  const [magnify, setMagnify] = useSetting("dock.magnify")
  const [watermark, setWatermark] = useSetting("desktop.watermark")
  const [url, setUrl] = useState(wallpaper.startsWith("builtin:") ? "" : wallpaper)
  const [dockDraft, setDockDraft] = useState(size)
  useEffect(() => setDockDraft(size), [size])
  return (
    <>
      <Group title="Wallpaper">
        <div className="grid grid-cols-5 gap-2.5">
          {WALLPAPERS.map((w) => (
            <button key={w.id} onClick={() => setWallpaper(`builtin:${w.id}`)} className="group text-center">
              <div className={cn("aspect-[16/10] rounded-lg ring-offset-2 ring-offset-background transition", wallpaper === `builtin:${w.id}` ? "ring-2 ring-primary" : "group-hover:ring-2 group-hover:ring-foreground/20")} style={{ background: w.preview }} />
              <span className="mt-1 block text-[11.5px] text-muted-foreground">{w.name}</span>
            </button>
          ))}
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="wp-url">Custom image</FieldLabel>
          <div className="flex gap-2">
            <Input id="wp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or file:<root>:/Pictures/photo.jpg" className="h-8" />
            <Button size="sm" variant="secondary" disabled={!url.trim()} onClick={() => setWallpaper(url.trim())}>Apply</Button>
          </div>
          <FieldDescription>An image URL, or a file from the file manager using <code>file:rootId:/path</code>.</FieldDescription>
        </Field>
      </Group>
      <Group title="Dock">
        <Row label="Icon size"><Slider className="w-40" min={40} max={80} step={2} value={[dockDraft]} onValueChange={([v]) => setDockDraft(v)} onValueCommit={([v]) => setSize(v)} /></Row>
        <Row label="Magnification" hint="Icons grow under the pointer."><Switch checked={magnify} onCheckedChange={setMagnify} /></Row>
      </Group>
      <Group title="Widgets">
        <Row label="Desktop watermark"><Switch checked={watermark} onCheckedChange={setWatermark} /></Row>
        <Row label="Arrange widgets" hint="Drag, resize, add or remove widgets on the desktop.">
          <Button size="sm" variant="secondary" onClick={() => useUi.getState().setEditingWidgets(true)}>Edit widgets…</Button>
        </Row>
      </Group>
    </>
  )
}

function FileAccess() {
  const { data: roots } = useRoots()
  const { add, update, remove } = useRootMutations()
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [readOnly, setReadOnly] = useState(false)
  return (
    <>
      <p className="mb-4 text-[13px] text-muted-foreground">NodeDesk can only read or change files inside the folders listed here. Everything else on the server stays out of reach, even for the admin session.</p>
      <Group title="Authorised folders">
        {(roots ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 first:pt-0 last:border-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{r.name} {!r.available && <span className="text-xs font-normal text-destructive">(unavailable)</span>}</p>
              <p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.path}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Read-only <Switch checked={r.readOnly} onCheckedChange={(v) => update.mutate({ id: r.id, name: r.name, readOnly: v })} /></label>
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${r.name}`} disabled={(roots?.length ?? 0) <= 1} onClick={() => remove.mutate(r.id)}><Trash2 /></Button>
          </div>
        ))}
      </Group>
      <Group title="Add a folder">
        <FieldGroup>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Field><FieldLabel htmlFor="root-name">Name</FieldLabel><Input id="root-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Media" className="h-8" /></Field>
            <Field><FieldLabel htmlFor="root-path">Absolute path</FieldLabel><Input id="root-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/media" className="h-8 font-mono" /></Field>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px]"><Switch checked={readOnly} onCheckedChange={setReadOnly} />Read-only</label>
            <Button size="sm" disabled={!name.trim() || !path.trim() || add.isPending} onClick={() => add.mutate({ name, path, readOnly }, { onSuccess: () => { setName(""); setPath(""); toast.success("Folder authorised") } })}>Add folder</Button>
          </div>
        </FieldGroup>
      </Group>
    </>
  )
}

function Security() {
  const qc = useQueryClient()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [busy, setBusy] = useState(false)
  const change = async () => {
    setBusy(true)
    try {
      await api.post("/api/auth/password", { current, next })
      toast.success("Password changed. Please sign in again.")
      qc.invalidateQueries({ queryKey: keys.auth })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Group title="Admin password" description="Changing it signs out every session.">
        <FieldGroup>
          <Field><FieldLabel htmlFor="pw-cur">Current password</FieldLabel><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-8" /></Field>
          <Field><FieldLabel htmlFor="pw-new">New password</FieldLabel><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-8" /><FieldDescription>At least 8 characters.</FieldDescription></Field>
          <div><Button size="sm" disabled={busy || !current || next.length < 8} onClick={change}>Change password</Button></div>
        </FieldGroup>
      </Group>
      <Group title="Sign out">
        <Row label="End this session on this browser">
          <Button size="sm" variant="secondary" onClick={async () => { await api.post("/api/auth/logout"); qc.invalidateQueries({ queryKey: keys.auth }) }}>Sign out</Button>
        </Row>
      </Group>
    </>
  )
}

function Activity() {
  const { data } = useAudit()
  return (
    <Group title="Recent activity" description="Sign-ins, container actions, file deletions and configuration changes.">
      {data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      <ul className="-my-1 divide-y divide-border/60">
        {data?.map((e) => (
          <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-[12.5px]">
            <span className={cn("size-1.5 shrink-0 self-center rounded-full", e.level === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground/40")} />
            <span className="w-20 shrink-0 text-muted-foreground">{e.source}</span>
            <span className="min-w-0 flex-1 break-all">{e.message}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{formatDate(e.ts * 1000, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </li>
        ))}
      </ul>
    </Group>
  )
}

function About() {
  const { data: info } = useSystemInfo()
  const { data: auth } = useAuth()
  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <div className="grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground"><Logo size={34} /></div>
        <div>
          <h3 className="text-lg font-semibold">NodeDesk</h3>
          <p className="text-[13px] text-muted-foreground">Version {auth?.version ?? "dev"} · MIT License</p>
          <button className="text-[13px] text-primary hover:underline" onClick={() => launch("files")}>Open Files</button>
        </div>
      </div>
      {info && (
        <Group title="This server">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">Hostname</dt><dd>{info.hostname}</dd>
            <dt className="text-muted-foreground">System</dt><dd>{info.os}</dd>
            <dt className="text-muted-foreground">Kernel</dt><dd>{info.kernel} ({info.arch})</dd>
            <dt className="text-muted-foreground">CPU</dt><dd>{info.cpuModel} · {info.cores} threads</dd>
            <dt className="text-muted-foreground">Memory</dt><dd>{formatBytes(info.memTotal)}</dd>
            {info.gpus.length > 0 && <><dt className="text-muted-foreground">GPU</dt><dd>{info.gpus.join(", ")}</dd></>}
            <dt className="text-muted-foreground">Addresses</dt><dd>{info.ips.join(", ")}</dd>
            <dt className="text-muted-foreground">Uptime</dt><dd>{formatDuration(info.uptime)}</dd>
          </dl>
        </Group>
      )}
    </>
  )
}

export default function SettingsApp({ props }: DesktopAppProps) {
  const [section, setSection] = useState<Section>((props.section as Section) ?? "general")
  useEffect(() => {
    if (props.section) setSection(props.section as Section)
  }, [props.section])

  return (
    <div className="flex h-full">
      <nav className="w-[210px] shrink-0 border-r border-border/70 bg-sidebar p-2.5">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={cn("mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13.5px]", section === s.id ? "bg-primary text-primary-foreground" : "hover:bg-foreground/6")}>
            <s.icon className="size-[17px]" strokeWidth={1.7} />{s.label}
          </button>
        ))}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <h2 className="mb-5 text-[20px] font-semibold tracking-tight">{SECTIONS.find((s) => s.id === section)?.label}</h2>
        {section === "general" && <General />}
        {section === "desktop" && <Desktop />}
        {section === "files" && <FileAccess />}
        {section === "security" && <Security />}
        {section === "activity" && <Activity />}
        {section === "about" && <About />}
      </main>
    </div>
  )
}
