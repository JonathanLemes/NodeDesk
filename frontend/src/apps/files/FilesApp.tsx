import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronLeft, ChevronRight, ChevronRight as Crumb, FilePlus, FolderPlus, LayoutGrid, List, PanelLeft, PanelRight, Plus, Search, Upload, X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react"
import { toast } from "sonner"

import { GridView, ListView, DND_TYPE, sortEntries, type Sort, type SortKey } from "@/apps/files/FileViews"
import { InfoDialog } from "@/apps/files/InfoDialog"
import { baseName, crumbsOf, parentOf } from "@/apps/files/paths"
import { PreviewPane } from "@/apps/files/PreviewPane"
import { Sidebar, type Location } from "@/apps/files/Sidebar"
import { TrashView } from "@/apps/files/TrashView"
import { collectDropped, useUploads } from "@/apps/files/uploads"
import { UploadTray } from "@/apps/files/UploadTray"
import type { DesktopAppProps } from "@/apps/sdk"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAppMenus } from "@/hooks/useAppMenus"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useSetting } from "@/hooks/useSetting"
import { cn } from "@/lib/utils"
import { ApiError } from "@/services/api"
import { errorMessage, filesApi, fileUrl, useListing, useRoots, useSearch } from "@/services/queries"
import { useClipboard } from "@/stores/clipboard"
import { useWindows } from "@/stores/windows"
import type { FileEntry, FileRef } from "@/types/api"
import { launch } from "@/windows/launch"
import { useWindowContext, WindowToolbar } from "@/windows/context"
import { t } from "@/i18n"

const LS = { view: "nodedesk.files.view", preview: "nodedesk.files.preview", hidden: "nodedesk.files.hidden" }
function lsGet(key: string, def: string): string {
  try { return localStorage.getItem(key) ?? def } catch { return def }
}
function lsSet(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* ignore */ }
}

type MenuKit = { Item: React.ElementType; Sep: React.ElementType }

export default function FilesApp({ props }: DesktopAppProps) {
  const qc = useQueryClient()
  const { data: roots } = useRoots()
  const [favorites, setFavorites] = useSetting("files.favorites")
  const clipboard = useClipboard()
  const enqueue = useUploads((s) => s.enqueue)
  const { focused } = useWindowContext()
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)

  const [loc, setLoc] = useState<Location | null>(null)
  const [back, setBack] = useState<Location[]>([])
  const [fwd, setFwd] = useState<Location[]>([])
  const [view, setView] = useState<"grid" | "list">(lsGet(LS.view, "grid") === "list" ? "list" : "grid")
  const [showPreview, setShowPreview] = useState(lsGet(LS.preview, "1") === "1")
  const [showHidden, setShowHidden] = useState(lsGet(LS.hidden, "0") === "1")
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" })
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [info, setInfo] = useState<FileRef | null>(null)
  const [confirm, setConfirm] = useState<FileEntry[] | null>(null)
  const [ctx, setCtx] = useState<"item" | "blank">("blank")
  const [dropActive, setDropActive] = useState(false)
  const anchor = useRef<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const dir = loc?.kind === "dir" ? loc : null
  const root = dir?.root
  const rootInfo = roots?.find((r) => r.id === root)

  // ------------------------------------------------------------- navigation
  const go = useCallback((next: Location, push = true) => {
    setLoc((cur) => {
      if (push && cur) setBack((b) => [...b, cur])
      return next
    })
    if (push) setFwd([])
    setSelection(new Set())
    setRenaming(null)
    setQuery("")
    anchor.current = null
  }, [])

  // Initial location (first root) or one requested at launch time.
  const requested = props.location === "trash" ? "trash" : props.root ? `${props.root}:${props.path ?? "/"}` : ""
  const lastRequested = useRef("")
  useEffect(() => {
    if (!roots) return
    if (requested && requested !== lastRequested.current) {
      lastRequested.current = requested
      if (props.location === "trash") go({ kind: "trash" }, !!loc)
      else go({ kind: "dir", root: String(props.root), path: String(props.path ?? "/") }, !!loc)
      return
    }
    if (!loc) {
      const first = roots.find((r) => r.available)
      if (first) setLoc({ kind: "dir", root: first.id, path: "/" })
    }
  }, [roots, requested, loc, go, props.location, props.root, props.path])

  const goBack = () => {
    if (!back.length || !loc) return
    const prev = back[back.length - 1]
    setBack(back.slice(0, -1))
    setFwd([loc, ...fwd])
    go(prev, false)
  }
  const goForward = () => {
    if (!fwd.length || !loc) return
    const next = fwd[0]
    setFwd(fwd.slice(1))
    setBack([...back, loc])
    go(next, false)
  }

  // ------------------------------------------------------------------- data
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 300)
    return () => window.clearTimeout(t)
  }, [query])

  const listing = useListing(root, dir?.path ?? "/", !!dir)
  const search = useSearch(root, dir?.path ?? "/", debounced)
  const searching = !!dir && debounced.trim().length > 0
  const readOnly = !!rootInfo?.readOnly || !!listing.data?.readOnly

  const entries = useMemo(() => {
    const src = searching ? (search.data?.entries ?? []) : (listing.data?.entries ?? [])
    return sortEntries(src.filter((e) => showHidden || !e.hidden), sort)
  }, [searching, search.data, listing.data, showHidden, sort])

  const selected = useMemo(() => entries.filter((e) => selection.has(e.path)), [entries, selection])
  const refsOf = (list: FileEntry[]): FileRef[] => list.map((e) => ({ root: root!, path: e.path }))
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["files"] }), [qc])

  const title = loc?.kind === "trash" ? t("app.trash") : dir ? (dir.path === "/" ? (rootInfo?.name ?? t("app.files")) : baseName(dir.path)) : t("app.files")

  // ---------------------------------------------------------------- actions
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      refresh()
    }
  }

  const openEntry = (e: FileEntry) => {
    if (!root) return
    if (e.isDir) {
      go({ kind: "dir", root, path: e.path })
      return
    }
    const existing = useWindows.getState().windows.find((w) => w.appId === "viewer" && w.props.root === root && w.props.path === e.path)
    if (existing) useWindows.getState().focus(existing.id)
    else launch("viewer", { root, path: e.path, name: e.name, kind: e.kind }, { forceNew: true, title: e.name })
  }

  const download = (list: FileEntry[]) => {
    if (!root || list.length === 0) return
    const a = document.createElement("a")
    a.href = fileUrl.download(root, list.map((e) => e.path))
    a.download = ""
    a.click()
  }

  const newFolder = () => run(async () => {
    if (!dir) return
    for (let i = 1; i < 50; i++) {
      const name = i === 1 ? t("files.new_folder_name") : t("files.new_folder_name_n", { n: i })
      try {
        const e = await filesApi.mkdir(dir.root, dir.path, name)
        await refresh()
        setSelection(new Set([e.path]))
        setRenaming(e.path)
        return
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err
      }
    }
  })

  const newFile = () => run(async () => {
    if (!dir) return
    for (let i = 1; i < 50; i++) {
      const name = i === 1 ? t("files.new_file_name") : t("files.new_file_name_n", { n: i })
      try {
        const e = await filesApi.create(dir.root, dir.path, name)
        await refresh()
        setSelection(new Set([e.path]))
        setRenaming(e.path)
        return
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err
      }
    }
  })

  const commitRename = (e: FileEntry, name: string | null) => {
    setRenaming(null)
    if (name && root) run(() => filesApi.rename(root, e.path, name))
  }

  const trash = (list: FileEntry[]) => root && list.length && run(() => filesApi.remove(refsOf(list)), list.length === 1 ? t("files.moved_to_trash_one", { name: list[0].name }) : t("files.moved_to_trash_many", { count: list.length })).then(() => setSelection(new Set()))
  const deletePermanently = (list: FileEntry[]) => root && run(() => filesApi.remove(refsOf(list), true)).then(() => setSelection(new Set()))

  const copySel = (mode: "copy" | "cut") => selected.length && clipboard.set(refsOf(selected), mode)
  const paste = (into?: FileRef) => {
    const dest = into ?? (dir ? { root: dir.root, path: dir.path } : null)
    if (!dest || clipboard.items.length === 0) return
    const op = clipboard.mode === "cut" ? filesApi.move : filesApi.copy
    run(() => op(clipboard.items, dest)).then(() => clipboard.mode === "cut" && clipboard.clear())
  }

  const favorite = (e: FileEntry) => {
    if (!root || favorites.some((f) => f.root === root && f.path === e.path)) return
    setFavorites([...favorites, { root, path: e.path }])
  }

  const uploadFiles = (list: FileList | null, keepPaths = false) => {
    if (!list || !dir) return
    enqueue(dir.root, dir.path, Array.from(list).map((file) => ({ file, rel: keepPaths ? (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name : file.name })))
  }

  // ------------------------------------------------------- selection & DnD
  const onSelect = (ev: MouseEvent, e: FileEntry) => {
    ev.stopPropagation()
    if (isMobile) return openEntry(e) // on a phone a tap opens; long-press shows the menu
    if (ev.ctrlKey || ev.metaKey) {
      setSelection((s) => { const n = new Set(s); if (n.has(e.path)) n.delete(e.path); else n.add(e.path); return n })
      anchor.current = e.path
    } else if (ev.shiftKey && anchor.current) {
      const a = entries.findIndex((x) => x.path === anchor.current)
      const b = entries.findIndex((x) => x.path === e.path)
      if (a >= 0 && b >= 0) setSelection(new Set(entries.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.path)))
    } else {
      setSelection(new Set([e.path]))
      anchor.current = e.path
    }
  }

  const onDragStart = (ev: DragEvent, e: FileEntry) => {
    if (!root) return
    const items = selection.has(e.path) ? refsOf(selected) : [{ root, path: e.path }]
    if (!selection.has(e.path)) setSelection(new Set([e.path]))
    ev.dataTransfer.setData(DND_TYPE, JSON.stringify(items))
    ev.dataTransfer.effectAllowed = "copyMove"
  }

  const handleDrop = async (ev: DragEvent, target: FileRef | "trash") => {
    ev.preventDefault()
    ev.stopPropagation()
    setDropActive(false)
    const raw = ev.dataTransfer.getData(DND_TYPE)
    if (raw) {
      const items = JSON.parse(raw) as FileRef[]
      if (target === "trash") return void run(() => filesApi.remove(items))
      if (items.some((i) => i.root === target.root && i.path === target.path)) return
      const copy = ev.altKey || ev.ctrlKey
      return void run(() => (copy ? filesApi.copy : filesApi.move)(items, target), copy ? t("files.copied") : undefined)
    }
    if (target === "trash" || !ev.dataTransfer.types.includes("Files")) return
    const files = await collectDropped(ev.dataTransfer)
    if (files.length) enqueue(target.root, target.path, files)
  }

  // --------------------------------------------------------------- keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelection(new Set(entries.map((x) => x.path))) }
    else if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySel("copy") }
    else if (mod && e.key.toLowerCase() === "x" && !readOnly) { e.preventDefault(); copySel("cut") }
    else if (mod && e.key.toLowerCase() === "v" && !readOnly) { e.preventDefault(); paste() }
    else if (e.key === "Enter" && selected.length === 1) openEntry(selected[0])
    else if (e.key === "F2" && selected.length === 1 && !readOnly) setRenaming(selected[0].path)
    else if ((e.key === "Delete" || e.key === "Backspace") && selected.length && !readOnly) {
      e.preventDefault()
      if (e.shiftKey) setConfirm(selected)
      else trash(selected)
    } else if (e.key === "Escape") { setSelection(new Set()); setQuery("") }
    else if (e.key === "Backspace" && dir && dir.path !== "/") go({ ...dir, path: parentOf(dir.path) })
    else if (e.key.startsWith("Arrow") && entries.length) {
      e.preventDefault()
      const cols = view === "grid" ? (getComputedStyle(scroller.current!.querySelector("[data-files-grid]") ?? document.body).gridTemplateColumns.split(" ").length || 1) : 1
      const cur = entries.findIndex((x) => x.path === [...selection].pop())
      const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : -cols
      const next = Math.max(0, Math.min(entries.length - 1, (cur < 0 ? (delta > 0 ? -1 : entries.length) : cur) + delta))
      setSelection(new Set([entries[next].path]))
      anchor.current = entries[next].path
      scroller.current?.querySelector(`[data-path="${CSS.escape(entries[next].path)}"]`)?.scrollIntoView({ block: "nearest" })
    }
  }

  // ------------------------------------------------------------------- menus
  const itemMenu = ({ Item, Sep }: MenuKit): ReactNode => {
    const one = selected.length === 1 ? selected[0] : null
    return (
      <>
        {one && <Item onSelect={() => openEntry(one)}>{t("common.open")}</Item>}
        {one && !one.isDir && one.editable && <Item onSelect={() => openEntry(one)} disabled={readOnly}>{t("common.edit")}</Item>}
        <Item onSelect={() => download(selected)}>{selected.length > 1 || one?.isDir ? t("files.download_zip") : t("common.download")}</Item>
        <Sep />
        <Item onSelect={() => copySel("copy")}>{t("edit.copy")}</Item>
        <Item onSelect={() => copySel("cut")} disabled={readOnly}>{t("edit.cut")}</Item>
        {one?.isDir && <Item onSelect={() => paste({ root: root!, path: one.path })} disabled={readOnly || clipboard.items.length === 0}>{t("files.paste_into", { name: one.name })}</Item>}
        {one && <Item onSelect={() => setRenaming(one.path)} disabled={readOnly}>{t("files.rename")}</Item>}
        <Sep />
        {one?.isDir && <Item onSelect={() => favorite(one)}>{t("files.add_favorite")}</Item>}
        {one && <Item onSelect={() => root && setInfo({ root, path: one.path })}>{t("files.get_info")}</Item>}
        <Sep />
        <Item variant="destructive" disabled={readOnly} onSelect={() => trash(selected)}>{t("files.move_to_trash")}</Item>
        <Item variant="destructive" disabled={readOnly} onSelect={() => setConfirm(selected)}>{t("files.delete_permanently")}</Item>
      </>
    )
  }

  const blankMenu = ({ Item, Sep }: MenuKit): ReactNode => (
    <>
      <Item onSelect={newFolder} disabled={readOnly}>{t("files.new_folder")}</Item>
      <Item onSelect={newFile} disabled={readOnly}>{t("files.new_file")}</Item>
      <Item onSelect={() => fileInput.current?.click()} disabled={readOnly}>{t("files.upload_files")}</Item>
      <Item onSelect={() => folderInput.current?.click()} disabled={readOnly}>{t("files.upload_folder")}</Item>
      <Sep />
      <Item onSelect={() => paste()} disabled={readOnly || clipboard.items.length === 0}>{t("edit.paste")}</Item>
      <Item onSelect={() => setSelection(new Set(entries.map((e) => e.path)))}>{t("edit.select_all")}</Item>
      <Sep />
      <Item onSelect={() => { const v = !showHidden; setShowHidden(v); lsSet(LS.hidden, v ? "1" : "0") }}>{showHidden ? t("files.hide_hidden") : t("files.show_hidden")}</Item>
      <Item onSelect={refresh}>{t("common.refresh")}</Item>
      <Item onSelect={() => dir && setInfo({ root: dir.root, path: dir.path })}>{t("files.get_info")}</Item>
    </>
  )

  const ctxKit = { Item: ContextMenuItem, Sep: ContextMenuSeparator }
  const ddKit = { Item: DropdownMenuItem, Sep: DropdownMenuSeparator }

  useAppMenus({
    File: [
      { label: t("files.new_folder"), onSelect: newFolder, disabled: readOnly || !dir },
      { label: t("files.new_file"), onSelect: newFile, disabled: readOnly || !dir },
      { label: t("files.upload_files"), onSelect: () => fileInput.current?.click(), disabled: readOnly || !dir },
      { label: t("files.rename"), onSelect: () => selected[0] && setRenaming(selected[0].path), disabled: readOnly || selected.length !== 1, separatorBefore: true },
      { label: t("files.get_info"), onSelect: () => root && selected[0] && setInfo({ root, path: selected[0].path }), disabled: selected.length !== 1 },
      { label: t("files.move_to_trash"), shortcut: "Del", onSelect: () => trash(selected), disabled: readOnly || selected.length === 0, separatorBefore: true },
    ],
    Edit: [
      { label: t("edit.copy"), shortcut: "Ctrl+C", onSelect: () => copySel("copy"), disabled: selected.length === 0 },
      { label: t("edit.cut"), shortcut: "Ctrl+X", onSelect: () => copySel("cut"), disabled: readOnly || selected.length === 0 },
      { label: t("edit.paste"), shortcut: "Ctrl+V", onSelect: () => paste(), disabled: readOnly || clipboard.items.length === 0 },
      { label: t("edit.select_all"), shortcut: "Ctrl+A", onSelect: () => setSelection(new Set(entries.map((e) => e.path))), separatorBefore: true },
    ],
    View: [
      { label: t("files.as_icons"), checked: view === "grid", onSelect: () => { setView("grid"); lsSet(LS.view, "grid") } },
      { label: t("files.as_list"), checked: view === "list", onSelect: () => { setView("list"); lsSet(LS.view, "list") } },
      { label: showPreview ? t("files.hide_preview") : t("files.show_preview"), onSelect: () => { setShowPreview(!showPreview); lsSet(LS.preview, showPreview ? "0" : "1") } },
      { label: showHidden ? t("files.hide_hidden_long") : t("files.show_hidden_long"), onSelect: () => { setShowHidden(!showHidden); lsSet(LS.hidden, showHidden ? "0" : "1") } },
    ],
    Go: [
      { label: t("common.back"), onSelect: goBack, disabled: back.length === 0 },
      { label: t("common.forward"), onSelect: goForward, disabled: fwd.length === 0 },
      { label: t("files.enclosing"), onSelect: () => dir && go({ ...dir, path: parentOf(dir.path) }), disabled: !dir || dir.path === "/" },
      { label: t("app.trash"), onSelect: () => go({ kind: "trash" }), separatorBefore: true },
    ],
  })

  // ------------------------------------------------------------------ render
  const isFolderEmpty = !listing.isLoading && !searching && entries.length === 0
  const showGrid = view === "grid"

  const body = loc?.kind === "trash" ? (
    <TrashView />
  ) : listing.isError && !searching ? (
    <Empty className="h-full"><EmptyHeader>
      <EmptyMedia variant="icon"><X /></EmptyMedia>
      <EmptyTitle>{t("files.cant_open")}</EmptyTitle>
      <EmptyDescription>{errorMessage(listing.error)}</EmptyDescription>
    </EmptyHeader><Button size="sm" variant="secondary" onClick={() => listing.refetch()}>{t("common.try_again")}</Button></Empty>
  ) : (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={scroller}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onClick={() => setSelection(new Set())}
          onContextMenuCapture={(e) => {
            const item = (e.target as HTMLElement).closest<HTMLElement>("[data-path]")
            if (item) {
              setCtx("item")
              if (!selection.has(item.dataset.path!)) setSelection(new Set([item.dataset.path!]))
            } else { setCtx("blank"); setSelection(new Set()) }
          }}
          onDragOver={(e) => { if (dir && !readOnly && (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DND_TYPE))) { e.preventDefault(); setDropActive(true) } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDropActive(false) }}
          onDrop={(e) => dir && !readOnly && handleDrop(e, { root: dir.root, path: dir.path })}
          className={cn("h-full overflow-auto outline-none", dropActive && "bg-primary/5 ring-2 ring-primary/50 ring-inset")}
        >
          {isFolderEmpty ? (
            <Empty className="h-full"><EmptyHeader>
              <EmptyMedia variant="icon"><FolderPlus /></EmptyMedia>
              <EmptyTitle>{t("files.empty")}</EmptyTitle>
              <EmptyDescription>{readOnly ? t("files.empty_readonly") : t("files.empty_drop")}</EmptyDescription>
            </EmptyHeader></Empty>
          ) : searching && !search.isFetching && entries.length === 0 ? (
            <Empty className="h-full"><EmptyHeader>
              <EmptyMedia variant="icon"><Search /></EmptyMedia>
              <EmptyTitle>{t("files.no_results_for", { q: debounced })}</EmptyTitle>
            </EmptyHeader></Empty>
          ) : root ? (
            showGrid ? (
              <GridView root={root} entries={entries} selection={selection} renaming={renaming} showPath={searching}
                onSelect={onSelect} onOpen={openEntry} onRename={commitRename} onDragStart={onDragStart} onDropOn={(e, target) => handleDrop(e, { root, path: target.path })} />
            ) : (
              <ListView root={root} entries={entries} selection={selection} renaming={renaming} showPath={searching}
                sort={sort} onSort={(key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}
                onSelect={onSelect} onOpen={openEntry} onRename={commitRename} onDragStart={onDragStart} onDropOn={(e, target) => handleDrop(e, { root, path: target.path })} />
            )
          ) : null}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">{ctx === "item" ? itemMenu(ctxKit) : blankMenu(ctxKit)}</ContextMenuContent>
    </ContextMenu>
  )

  return (
    <div className="relative flex h-full overflow-hidden" data-focused={focused}>
      <WindowToolbar>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("files.sidebar")} onClick={() => setNavOpen(true)}><PanelLeft /></Button>
        <Button variant="ghost" size="icon" aria-label={t("common.back")} disabled={!back.length} onClick={goBack}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon" className="max-md:hidden" aria-label={t("common.forward")} disabled={!fwd.length} onClick={goForward}><ChevronRight /></Button>
        <h2 className="ml-2 min-w-0 truncate text-[16px] font-semibold">{title}</h2>
        <div className="flex-1" />
        <ToggleGroup type="single" value={view} onValueChange={(v) => { if (v) { setView(v as "grid" | "list"); lsSet(LS.view, v) } }} className="gap-0.5">
          <ToggleGroupItem value="grid" aria-label={t("files.icons")} size="sm"><LayoutGrid /></ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t("files.list")} size="sm"><List /></ToggleGroupItem>
        </ToggleGroup>
        <Button className="max-md:hidden" variant={showPreview ? "secondary" : "ghost"} size="icon-sm" aria-label={t("files.toggle_preview")} onClick={() => { setShowPreview(!showPreview); lsSet(LS.preview, showPreview ? "0" : "1") }}><PanelRight /></Button>
        <div className="relative ml-1 w-[230px] max-md:w-28 max-md:focus-within:w-40">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("common.search")} disabled={!dir}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            className="h-8 rounded-lg border-border/80 bg-muted/50 pl-8 text-[13px]" />
        </div>
      </WindowToolbar>

      {isMobile && navOpen && <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setNavOpen(false)} />}
      <div className={isMobile ? cn("absolute inset-y-0 left-0 z-30 flex transition-transform duration-200", navOpen ? "translate-x-0" : "-translate-x-full") : "flex"}>
      <Sidebar
        roots={roots ?? []}
        favorites={favorites}
        location={loc}
        onNavigate={(l) => { go(l); setNavOpen(false) }}
        onDropTo={handleDrop}
        onRemoveFavorite={(f) => setFavorites(favorites.filter((x) => !(x.root === f.root && x.path === f.path)))}
      />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {dir && (
          <div className="flex items-center border-b border-border/70 pr-3 pl-5">
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 py-2.5 text-[13px]" aria-label={t("files.breadcrumb")}>
              {[{ name: rootInfo?.name ?? t("app.files"), path: "/" }, ...crumbsOf(dir.path)].map((c, i, all) => (
                <span key={c.path} className="flex items-center gap-0.5"
                  onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_TYPE)) e.preventDefault() }}
                  onDrop={(e) => handleDrop(e, { root: dir.root, path: c.path })}>
                  <button onClick={() => go({ ...dir, path: c.path })} className={cn("rounded px-1.5 py-0.5 hover:bg-foreground/8", i === all.length - 1 ? "font-medium" : "text-muted-foreground")}>{c.name}</button>
                  {i < all.length - 1 && <Crumb className="size-3.5 text-muted-foreground/70" />}
                </span>
              ))}
              {searching && <span className="ml-2 text-muted-foreground">— search results{search.data?.truncated ? " (partial)" : ""}</span>}
            </nav>
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Plus data-icon="inline-start" />{t("common.new")}</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <DropdownMenuItem onSelect={newFolder}><FolderPlus />{t("files.new_folder")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={newFile}><FilePlus />{t("files.new_file")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => fileInput.current?.click()}><Upload />{t("files.upload_files")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => folderInput.current?.click()}><Upload />{t("files.upload_folder")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">{body}</div>
          {showPreview && dir && !isMobile && (
            <PreviewPane
              root={dir.root} selected={selected} folderName={title} folderItems={entries.length}
              onOpen={openEntry} onDownload={download} menu={itemMenu(ddKit)}
            />
          )}
        </div>
      </div>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = "" }} />
      <input ref={folderInput} type="file" hidden onChange={(e) => { uploadFiles(e.target.files, true); e.target.value = "" }}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
      <UploadTray />
      <InfoDialog target={info} onClose={() => setInfo(null)} />
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.length === 1 ? t("files.delete_confirm_one", { name: confirm[0].name }) : t("files.delete_confirm_many", { count: confirm?.length ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t("files.delete_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirm && deletePermanently(confirm)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
