import { Archive, FileText, FileVideo, ImageIcon, Link2Off, Music } from "lucide-react"
import { useState } from "react"

import { FolderGlyph } from "@/apps/icons"
import { cn } from "@/lib/utils"
import { fileUrl } from "@/services/queries"
import type { FileEntry, FileKind } from "@/types/api"

const THUMB_MAX = 8 * 1024 * 1024

function Paper({ size, children, tone = "paper" }: { size: number; children?: React.ReactNode; tone?: "paper" | "dark" }) {
  const w = size * 0.74
  const h = size * 0.92
  return (
    <div
      className={cn("relative flex items-center justify-center", tone === "dark" ? "text-white" : "text-foreground/50")}
      style={{
        width: w, height: h, borderRadius: size * 0.1,
        background: tone === "dark" ? "linear-gradient(160deg,#3b3f46,#1c1e22)" : "linear-gradient(180deg,var(--card),var(--secondary))",
        boxShadow: "0 0 0 0.5px oklch(0 0 0 / 0.18), 0 2px 5px oklch(0 0 0 / 0.12)",
      }}
    >
      {children}
    </div>
  )
}

function Lines({ size }: { size: number }) {
  return (
    <div className="flex flex-col" style={{ gap: size * 0.045 }}>
      {[0.42, 0.42, 0.3, 0.42, 0.34].map((w, i) => <div key={i} className="rounded-full bg-current opacity-30" style={{ width: size * w, height: size * 0.025 }} />)}
    </div>
  )
}

export function KindGlyph({ kind, size }: { kind: FileKind; size: number }) {
  switch (kind) {
    case "folder": return <FolderGlyph size={size} />
    case "code": case "json": case "yaml": case "log":
      return <Paper size={size} tone="dark"><span style={{ fontSize: size * 0.2 }} className="font-mono font-semibold">&gt;_</span></Paper>
    case "audio": return <Paper size={size}><Music size={size * 0.36} strokeWidth={1.5} className="text-pink-500" /></Paper>
    case "video": return <Paper size={size}><FileVideo size={size * 0.38} strokeWidth={1.5} className="text-violet-500" /></Paper>
    case "pdf": return <Paper size={size}><span style={{ fontSize: size * 0.17 }} className="font-bold text-red-500">PDF</span></Paper>
    case "archive": return <Paper size={size}><Archive size={size * 0.36} strokeWidth={1.5} className="text-amber-500" /></Paper>
    case "image": return <Paper size={size}><ImageIcon size={size * 0.36} strokeWidth={1.5} className="text-sky-500" /></Paper>
    case "markdown": case "text": return <Paper size={size}><Lines size={size} /></Paper>
    default: return <Paper size={size}><FileText size={size * 0.34} strokeWidth={1.4} /></Paper>
  }
}

interface FileIconProps {
  entry: FileEntry
  root: string
  size: number
  /** Show real image thumbnails (skipped for huge files). */
  thumbnail?: boolean
}

export function FileIcon({ entry, root, size, thumbnail = true }: FileIconProps) {
  const [failed, setFailed] = useState(false)
  if (entry.broken) return <div className="grid place-items-center" style={{ width: size, height: size }}><Link2Off className="text-muted-foreground" size={size * 0.5} strokeWidth={1.3} /></div>
  if (entry.kind === "image" && thumbnail && !failed && entry.size < THUMB_MAX) {
    return (
      <div className="grid place-items-center" style={{ width: size, height: size }}>
        <img
          src={fileUrl.raw(root, entry.path)} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)}
          className="max-h-full max-w-full rounded-[5px] object-cover shadow-[0_0_0_0.5px_oklch(0_0_0/0.2),0_2px_5px_oklch(0_0_0/0.15)]"
          style={{ maxWidth: size * 0.95, maxHeight: size * 0.8 }}
        />
      </div>
    )
  }
  return (
    <div className="grid place-items-center" style={{ width: size, height: size }}>
      <KindGlyph kind={entry.kind} size={size * 0.86} />
    </div>
  )
}
