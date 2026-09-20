import { Download, Eye, FileQuestion, Pencil, Save } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { KindGlyph } from "@/apps/files/FileIcon"
import type { DesktopAppProps } from "@/apps/sdk"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppMenus } from "@/hooks/useAppMenus"
import { useTheme } from "@/hooks/useTheme"
import { useShortcut, useShortcutLabels } from "@/services/shortcuts"
import { ApiError } from "@/services/api"
import { errorMessage, filesApi, fileUrl, useRoots } from "@/services/queries"
import { useWindows } from "@/stores/windows"
import type { FileKind, TextFile } from "@/types/api"
import { useWindowContext, WindowToolbar } from "@/windows/context"
import { t } from "@/i18n"

const CodeEditor = lazy(() => import("./CodeEditor"))
const TEXT_KINDS: FileKind[] = ["text", "code", "json", "yaml", "log", "markdown"]

export default function ViewerApp({ windowId, props }: DesktopAppProps) {
  const root = String(props.root)
  const path = String(props.path)
  const name = String(props.name)
  const kind = props.kind as FileKind
  const src = fileUrl.raw(root, path)
  const { data: roots } = useRoots()
  const { resolved } = useTheme()
  const label = useShortcutLabels()
  const setTitle = useWindows((s) => s.setTitle)
  const { focused } = useWindowContext()

  const isText = TEXT_KINDS.includes(kind)
  const readOnly = roots?.find((r) => r.id === root)?.readOnly ?? true

  const [file, setFile] = useState<TextFile | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"preview" | "edit">(kind === "markdown" ? "preview" : "edit")
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = file !== null && draft !== file.content

  const load = useCallback(() => {
    if (!isText) return
    setError(null)
    filesApi.readText(root, path).then((f) => { setFile(f); setDraft(f.content) }).catch((e) => setError(errorMessage(e)))
  }, [isText, root, path])
  useEffect(load, [load])

  useEffect(() => setTitle(windowId, `${dirty ? "● " : ""}${name}`), [dirty, name, windowId, setTitle])

  const save = useCallback(async (force = false) => {
    if (!file || readOnly || !dirty) return
    setSaving(true)
    try {
      const res = await filesApi.writeText(root, path, draft, force ? 0 : file.modTime)
      setFile({ content: draft, size: res.size, modTime: res.modTime })
      toast.success(t("viewer.saved"))
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true)
      else toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }, [file, readOnly, dirty, root, path, draft])

  // Always claims the key so the browser's "Save page" dialog never opens over an editor.
  useShortcut("viewer.save", () => void save())

  useAppMenus({
    File: [
      { label: t("common.save"), shortcut: label("viewer.save"), onSelect: () => save(), disabled: !dirty || readOnly },
      { label: t("viewer.reload_disk"), onSelect: load, disabled: !isText },
      { label: t("common.download"), onSelect: () => window.open(fileUrl.download(root, [path])), separatorBefore: true },
    ],
  })

  let content: React.ReactNode
  switch (true) {
    case kind === "image":
      content = (
        <div className="grid h-full place-items-center overflow-auto bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)_50%/20px_20px] p-4">
          <img src={src} alt={name} className="max-h-full max-w-full object-contain shadow-lg" />
        </div>
      )
      break
    case kind === "video":
      content = <div className="grid h-full place-items-center bg-black"><video src={src} controls autoPlay={false} className="max-h-full max-w-full" /></div>
      break
    case kind === "audio":
      content = (
        <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
          <KindGlyph kind="audio" size={120} />
          <p className="max-w-md truncate text-sm font-medium">{name}</p>
          <audio src={src} controls className="w-full max-w-md" />
        </div>
      )
      break
    case kind === "pdf":
      content = <iframe src={src} title={name} className="size-full border-0 bg-white" />
      break
    case isText && error !== null:
      content = <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><FileQuestion /></EmptyMedia><EmptyTitle>{t("viewer.cant_open")}</EmptyTitle><EmptyDescription>{error}</EmptyDescription></EmptyHeader></Empty>
      break
    case isText && file === null:
      content = <div className="flex flex-col gap-2 p-6"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
      break
    case kind === "markdown" && mode === "preview":
      content = (
        <div className="h-full overflow-auto px-8 py-6">
          <article data-selectable className="prose-nd mx-auto max-w-3xl text-[14.5px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
          </article>
        </div>
      )
      break
    case isText:
      content = (
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">{t("viewer.loading_editor")}</div>}>
          <CodeEditor value={draft} fileName={name} readOnly={readOnly} dark={resolved === "dark"} onChange={setDraft} />
        </Suspense>
      )
      break
    default:
      content = (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileQuestion /></EmptyMedia>
            <EmptyTitle>{t("viewer.no_preview")}</EmptyTitle>
            <EmptyDescription>{t("viewer.no_preview_desc")}</EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => window.open(fileUrl.download(root, [path]))}><Download data-icon="inline-start" />{t("common.download")}</Button>
        </Empty>
      )
  }

  return (
    <div className="flex h-full flex-col" data-focused={focused}>
      <WindowToolbar>
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{dirty ? "● " : ""}{name}</span>
        {kind === "markdown" && (
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "preview" | "edit")} size="sm">
            <ToggleGroupItem value="preview" aria-label={t("viewer.preview")}><Eye /></ToggleGroupItem>
            <ToggleGroupItem value="edit" aria-label={t("common.edit")}><Pencil /></ToggleGroupItem>
          </ToggleGroup>
        )}
        {isText && !readOnly && (
          <Button size="sm" disabled={!dirty || saving} onClick={() => save()}><Save data-icon="inline-start" />{t("common.save")}</Button>
        )}
        {isText && readOnly && <span className="text-xs text-muted-foreground">{t("common.read_only")}</span>}
        <Button variant="ghost" size="icon" aria-label={t("common.download")} onClick={() => window.open(fileUrl.download(root, [path]))}><Download /></Button>
      </WindowToolbar>
      <div className="min-h-0 flex-1">{content}</div>

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("viewer.conflict_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("viewer.conflict_desc", { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={load}>{t("viewer.reload")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => save(true)}>{t("viewer.overwrite")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
