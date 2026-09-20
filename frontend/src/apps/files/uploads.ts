import { create } from "zustand"

import { queryClient } from "@/services/queryClient"
import { errorMessage } from "@/services/queries"
import { t } from "@/i18n"

export interface UploadItem {
  id: number
  name: string
  size: number
  loaded: number
  status: "queued" | "uploading" | "done" | "error"
  error?: string
}

interface UploadJob { item: UploadItem; root: string; dir: string; file: File; rel: string }

interface UploadStore {
  items: UploadItem[]
  enqueue: (root: string, dir: string, files: { file: File; rel: string }[]) => void
  clearFinished: () => void
}

let nextId = 1
const queue: UploadJob[] = []
let running = 0
const CONCURRENCY = 2

export const useUploads = create<UploadStore>((set, get) => {
  const patch = (id: number, p: Partial<UploadItem>) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }))

  const pump = () => {
    while (running < CONCURRENCY && queue.length) {
      const job = queue.shift()!
      running++
      send(job, (loaded) => patch(job.item.id, { loaded, status: "uploading" }))
        .then(() => patch(job.item.id, { status: "done", loaded: job.file.size }))
        .catch((e) => patch(job.item.id, { status: "error", error: errorMessage(e) }))
        .finally(() => {
          running--
          if (!queue.length && running === 0) queryClient.invalidateQueries({ queryKey: ["files", "list"] })
          pump()
        })
    }
  }

  return {
    items: [],
    enqueue: (root, dir, files) => {
      const items: UploadItem[] = files.map(({ file, rel }) => ({ id: nextId++, name: rel, size: file.size, loaded: 0, status: "queued" }))
      set((s) => ({ items: [...s.items.filter((i) => i.status !== "done"), ...items] }))
      files.forEach((f, i) => queue.push({ item: items[i], root, dir, file: f.file, rel: f.rel }))
      pump()
      void get
    },
    clearFinished: () => set((s) => ({ items: s.items.filter((i) => i.status === "queued" || i.status === "uploading") })),
  }
})

function send(job: UploadJob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const q = new URLSearchParams({ root: job.root, path: job.dir, name: job.rel })
    xhr.open("POST", `/api/files/upload?${q}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      try {
        reject(new Error(JSON.parse(xhr.responseText).error))
      } catch {
        reject(new Error(xhr.statusText || t("upload.failed")))
      }
    }
    xhr.onerror = () => reject(new Error(t("upload.network")))
    xhr.send(job.file)
  })
}

/** Flattens a drop (files and whole folders) into files with their relative paths. */
export async function collectDropped(dt: DataTransfer): Promise<{ file: File; rel: string }[]> {
  const out: { file: File; rel: string }[] = []
  const entries = Array.from(dt.items ?? [])
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) return Array.from(dt.files).map((file) => ({ file, rel: file.name }))

  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.push({ file, rel: prefix + entry.name })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (batch.length === 0) break
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`)
      }
    }
  }
  for (const e of entries) await walk(e, "")
  return out
}
