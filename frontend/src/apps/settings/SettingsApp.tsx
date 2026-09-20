import { useQueryClient } from "@tanstack/react-query"
import { FolderLock, Info, Keyboard, LayoutDashboard, Lock, Monitor, Moon, ScrollText, Settings2, Sun, Trash2, type LucideIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"

import type { DesktopAppProps } from "@/apps/sdk"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ShortcutsSettings } from "@/apps/settings/ShortcutsSettings"
import { WALLPAPERS } from "@/desktop/wallpapers"
import { useClock24, useSetting } from "@/hooks/useSetting"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useHomeLayout } from "@/mobile/layout"
import { useTheme } from "@/hooks/useTheme"
import { formatBytes, formatDate, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { api } from "@/services/api"
import { errorMessage, keys, useAudit, useAuth, useRoots, useRootMutations, useSystemInfo } from "@/services/queries"
import { useUi } from "@/stores/ui"
import { launch } from "@/windows/launch"
import { LANGUAGES, t, type LangSetting } from "@/i18n"

type Section = "general" | "desktop" | "shortcuts" | "files" | "security" | "activity" | "about"

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "general", get label() { return t("settings.sec_general") }, icon: Settings2 },
  { id: "desktop", get label() { return t("settings.sec_desktop") }, icon: LayoutDashboard },
  { id: "shortcuts", get label() { return t("settings.sec_shortcuts") }, icon: Keyboard },
  { id: "files", get label() { return t("settings.sec_files") }, icon: FolderLock },
  { id: "security", get label() { return t("settings.sec_security") }, icon: Lock },
  { id: "activity", get label() { return t("settings.sec_activity") }, icon: ScrollText },
  { id: "about", get label() { return t("settings.sec_about") }, icon: Info },
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
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-40">
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
  const [h24, setH24] = useClock24()
  const [language, setLanguage] = useSetting("language")
  useEffect(() => setDraft(name), [name])
  return (
    <>
      <Group title={t("menubar.appearance")}>
        <Row label={t("settings.theme")} hint={t("settings.theme_hint")}>
          <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v as typeof theme)} variant="outline" size="sm">
            <ToggleGroupItem value="light" className="gap-1.5 px-3"><Sun className="size-3.5" />{t("theme.light")}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="gap-1.5 px-3"><Moon className="size-3.5" />{t("theme.dark")}</ToggleGroupItem>
            <ToggleGroupItem value="system" className="gap-1.5 px-3"><Monitor className="size-3.5" />{t("theme.auto")}</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>
      <Group title={t("settings.profile")}>
        <Row label={t("settings.display_name")} hint={t("settings.display_name_hint")}>
          <Input value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim() && draft !== name && setName(draft.trim())} className="h-8 w-48" />
        </Row>
        <Row label={t("settings.language")} hint={t("settings.language_hint")}>
          <Select value={language} onValueChange={(v) => setLanguage(v as LangSetting)}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">{t("settings.language_auto")}</SelectItem>
                {LANGUAGES.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Row>
        <Row label={t("settings.clock24")}><Switch checked={h24} onCheckedChange={setH24} /></Row>
      </Group>
    </>
  )
}

function Desktop() {
  const [, resetHome] = useHomeLayout()
  const [wallpaper, setWallpaper] = useSetting("wallpaper")
  const [size, setSize] = useSetting("dock.size")
  const [magnify, setMagnify] = useSetting("dock.magnify")
  const [watermark, setWatermark] = useSetting("desktop.watermark")
  const [url, setUrl] = useState(wallpaper.startsWith("builtin:") ? "" : wallpaper)
  const [dockDraft, setDockDraft] = useState(size)
  useEffect(() => setDockDraft(size), [size])
  return (
    <>
      <Group title={t("settings.wallpaper")}>
        <div className="grid grid-cols-5 gap-2.5 max-md:grid-cols-3">
          {WALLPAPERS.map((w) => (
            <button key={w.id} onClick={() => setWallpaper(`builtin:${w.id}`)} className="group text-center">
              <div className={cn("aspect-[16/10] rounded-lg ring-offset-2 ring-offset-background transition", wallpaper === `builtin:${w.id}` ? "ring-2 ring-primary" : "group-hover:ring-2 group-hover:ring-foreground/20")} style={{ background: w.preview }} />
              <span className="mt-1 block text-[11.5px] text-muted-foreground">{w.name}</span>
            </button>
          ))}
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="wp-url">{t("settings.custom_image")}</FieldLabel>
          <div className="flex gap-2">
            <Input id="wp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("settings.custom_image_ph")} className="h-8" />
            <Button size="sm" variant="secondary" disabled={!url.trim()} onClick={() => setWallpaper(url.trim())}>{t("common.apply")}</Button>
          </div>
          <FieldDescription>{t("settings.custom_image_hint")}</FieldDescription>
        </Field>
      </Group>
      <Group title={t("settings.dock")}>
        <Row label={t("settings.icon_size")}><Slider className="w-40" min={40} max={80} step={2} value={[dockDraft]} onValueChange={([v]) => setDockDraft(v)} onValueCommit={([v]) => setSize(v)} /></Row>
        <Row label={t("settings.magnification")} hint={t("settings.magnification_hint")}><Switch checked={magnify} onCheckedChange={setMagnify} /></Row>
      </Group>
      <Group title={t("settings.home_screen")}>
        <Row label={t("settings.reset_home")} hint={t("settings.reset_home_hint")}>
          <Button size="sm" variant="secondary" onClick={() => resetHome({ order: [], hidden: [] }, true)}>{t("settings.reset_home")}</Button>
        </Row>
      </Group>
      <Group title={t("settings.widgets")}>
        <Row label={t("settings.watermark")}><Switch checked={watermark} onCheckedChange={setWatermark} /></Row>
        <Row label={t("settings.arrange")} hint={t("settings.arrange_hint")}>
          <Button size="sm" variant="secondary" onClick={() => useUi.getState().setEditingWidgets(true)}>{t("menubar.edit_widgets")}</Button>
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
      <p className="mb-4 text-[13px] text-muted-foreground">{t("settings.roots_intro")}</p>
      <Group title={t("settings.roots")}>
        {(roots ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 first:pt-0 last:border-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">{r.name} {!r.available && <span className="text-xs font-normal text-destructive">{t("settings.unavailable")}</span>}</p>
              <p className="truncate font-mono text-[11.5px] text-muted-foreground">{r.path}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("common.read_only")} <Switch checked={r.readOnly} onCheckedChange={(v) => update.mutate({ id: r.id, name: r.name, readOnly: v })} /></label>
            <Button size="icon-sm" variant="ghost" aria-label={t("appform.remove_named", { name: r.name })} disabled={(roots?.length ?? 0) <= 1} onClick={() => remove.mutate(r.id)}><Trash2 /></Button>
          </div>
        ))}
      </Group>
      <Group title={t("settings.add_folder")}>
        <FieldGroup>
          <div className="grid grid-cols-[1fr_2fr] gap-3 max-md:grid-cols-1">
            <Field><FieldLabel htmlFor="root-name">{t("common.name")}</FieldLabel><Input id="root-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.root_name_ph")} className="h-8" /></Field>
            <Field><FieldLabel htmlFor="root-path">{t("settings.abs_path")}</FieldLabel><Input id="root-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/media" className="h-8 font-mono" /></Field>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px]"><Switch checked={readOnly} onCheckedChange={setReadOnly} />{t("common.read_only")}</label>
            <Button size="sm" disabled={!name.trim() || !path.trim() || add.isPending} onClick={() => add.mutate({ name, path, readOnly }, { onSuccess: () => { setName(""); setPath(""); toast.success(t("settings.folder_authorised")) } })}>{t("settings.add_folder_btn")}</Button>
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
      toast.success(t("settings.password_changed"))
      qc.invalidateQueries({ queryKey: keys.auth })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Group title={t("settings.admin_password")} description={t("settings.admin_password_desc")}>
        <FieldGroup>
          <Field><FieldLabel htmlFor="pw-cur">{t("settings.current_password")}</FieldLabel><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-8" /></Field>
          <Field><FieldLabel htmlFor="pw-new">{t("settings.new_password")}</FieldLabel><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-8" /><FieldDescription>{t("settings.password_hint")}</FieldDescription></Field>
          <div><Button size="sm" disabled={busy || !current || next.length < 8} onClick={change}>{t("settings.change_password")}</Button></div>
        </FieldGroup>
      </Group>
      <Group title={t("settings.sign_out")}>
        <Row label={t("settings.end_session")}>
          <Button size="sm" variant="secondary" onClick={async () => { await api.post("/api/auth/logout"); qc.invalidateQueries({ queryKey: keys.auth }) }}>{t("settings.sign_out")}</Button>
        </Row>
      </Group>
    </>
  )
}

function Activity() {
  const { data } = useAudit()
  return (
    <Group title={t("settings.activity")} description={t("settings.activity_desc")}>
      {data?.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.nothing_yet")}</p>}
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
          <p className="text-[13px] text-muted-foreground">{t("settings.version", { version: auth?.version ?? "dev" })}</p>
          <button className="text-[13px] text-primary hover:underline" onClick={() => launch("files")}>{t("desktop.open_files")}</button>
        </div>
      </div>
      {info && (
        <Group title={t("settings.this_server")}>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">{t("settings.hostname")}</dt><dd>{info.hostname}</dd>
            <dt className="text-muted-foreground">{t("about.system")}</dt><dd>{info.os}</dd>
            <dt className="text-muted-foreground">{t("settings.kernel")}</dt><dd>{info.kernel} ({info.arch})</dd>
            <dt className="text-muted-foreground">CPU</dt><dd>{info.cpuModel} · {t("about.threads", { count: info.cores })}</dd>
            <dt className="text-muted-foreground">{t("about.memory")}</dt><dd>{formatBytes(info.memTotal)}</dd>
            {info.gpus.length > 0 && <><dt className="text-muted-foreground">GPU</dt><dd>{info.gpus.join(", ")}</dd></>}
            <dt className="text-muted-foreground">{t("monitor.addresses")}</dt><dd>{info.ips.join(", ")}</dd>
            <dt className="text-muted-foreground">{t("about.uptime")}</dt><dd>{formatDuration(info.uptime)}</dd>
          </dl>
        </Group>
      )}
    </>
  )
}

export default function SettingsApp({ props }: DesktopAppProps) {
  // Shortcuts are edited on the web version; a phone has no keyboard to record them with.
  const sections = useIsMobile() ? SECTIONS.filter((s) => s.id !== "shortcuts") : SECTIONS
  const [section, setSection] = useState<Section>((props.section as Section) ?? "general")
  useEffect(() => {
    if (props.section) setSection(props.section as Section)
  }, [props.section])

  return (
    <div className="flex h-full max-md:flex-col">
      <nav className="w-[210px] shrink-0 border-r border-border/70 bg-sidebar p-2.5 max-md:flex max-md:w-full max-md:overflow-x-auto max-md:border-r-0 max-md:border-b max-md:p-2">
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} className={cn("mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13.5px] max-md:mb-0 max-md:w-auto max-md:shrink-0 max-md:whitespace-nowrap", section === s.id ? "bg-primary text-primary-foreground" : "hover:bg-foreground/6")}>
            <s.icon className="size-[17px]" strokeWidth={1.7} />{s.label}
          </button>
        ))}
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-6 max-md:p-4">
        <h2 className="mb-5 text-[20px] font-semibold tracking-tight">{sections.find((s) => s.id === section)?.label}</h2>
        {section === "general" && <General />}
        {section === "desktop" && <Desktop />}
        {section === "shortcuts" && <ShortcutsSettings />}
        {section === "files" && <FileAccess />}
        {section === "security" && <Security />}
        {section === "activity" && <Activity />}
        {section === "about" && <About />}
      </main>
    </div>
  )
}
