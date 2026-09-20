import {
  Bell, Bot, Captions, Cctv, ChartLine, Clapperboard, Cloud, Download, FolderOpen, Gamepad2, Gauge,
  Globe, HeartPulse, House, Layers, LayoutDashboard, type LucideIcon, Film, MessagesSquare, Mic,
  PlayCircle, Radar, ShieldCheck, Ticket, Tv,
} from "lucide-react"
import { useState } from "react"

import { IconTile } from "@/components/IconTile"
import { LUCIDE_ICONS } from "@/components/lucideIcons"

interface Glyph { icon?: LucideIcon; from: string; to: string }

const g = (from: string, to: string, icon?: LucideIcon): Glyph => ({ from, to, icon })

// Well-known self-hosted apps get a recognisable glyph and colour. Everything else
// falls back to a deterministic gradient with the app's initial.
const KNOWN: [string, Glyph][] = [
  ["jellyfin", g("#8b5cf6", "#2563eb", Clapperboard)],
  ["sonarr", g("#38bdf8", "#1d6fd8", Tv)],
  ["radarr", g("#fbbf24", "#f59e0b", Film)],
  ["prowlarr", g("#fb923c", "#ea580c", Radar)],
  ["bazarr", g("#c084fc", "#9333ea", Captions)],
  ["qbittorrent", g("#60a5fa", "#2563eb", Download)],
  ["seerr", g("#818cf8", "#4f46e5", Ticket)],
  ["overseerr", g("#818cf8", "#4f46e5", Ticket)],
  ["pihole", g("#f87171", "#dc2626", ShieldCheck)],
  ["pi-hole", g("#f87171", "#dc2626", ShieldCheck)],
  ["uptime", g("#4ade80", "#16a34a", HeartPulse)],
  ["ntfy", g("#34d399", "#059669", Bell)],
  ["webui", g("#94a3b8", "#475569", MessagesSquare)],
  ["ollama", g("#4b5563", "#111827", Bot)],
  ["homeassistant", g("#38bdf8", "#0284c7", House)],
  ["home-assistant", g("#38bdf8", "#0284c7", House)],
  ["homarr", g("#fb7185", "#e11d48", LayoutDashboard)],
  ["dockge", g("#38bdf8", "#0369a1", Layers)],
  ["beszel", g("#2dd4bf", "#0f766e", Gauge)],
  ["filebrowser", g("#60a5fa", "#2563eb", FolderOpen)],
  ["netdata", g("#4ade80", "#15803d", ChartLine)],
  ["icsee", g("#94a3b8", "#334155", Cctv)],
  ["neo", g("#a78bfa", "#6d28d9", Mic)],
  ["wolf", g("#fb923c", "#c2410c", Gamepad2)],
  ["plex", g("#fbbf24", "#b45309", PlayCircle)],
  ["nextcloud", g("#38bdf8", "#0369a1", Cloud)],
]

const PALETTE: [string, string][] = [
  ["#60a5fa", "#2563eb"], ["#a78bfa", "#7c3aed"], ["#f472b6", "#db2777"], ["#fb923c", "#ea580c"],
  ["#34d399", "#059669"], ["#22d3ee", "#0891b2"], ["#facc15", "#ca8a04"], ["#94a3b8", "#475569"],
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function glyphFor(name: string): Glyph {
  const key = name.toLowerCase()
  const hit = KNOWN.find(([k]) => key.includes(k))
  if (hit) return hit[1]
  const [from, to] = PALETTE[hash(key) % PALETTE.length]
  return { from, to }
}

interface AppIconProps {
  name: string
  /** "", "lucide:<name>" or an http(s) URL. */
  icon?: string
  size?: number
}

export function AppIcon({ name, icon, size = 56 }: AppIconProps) {
  const [broken, setBroken] = useState(false)
  const glyph = glyphFor(name)
  const bg = `linear-gradient(160deg, ${glyph.from}, ${glyph.to})`
  const inner = Math.round(size * 0.5)

  if (icon?.startsWith("http") && !broken) {
    return (
      <IconTile size={size} background="oklch(1 0 0 / 0.9)" className="overflow-hidden">
        <img src={icon} alt="" draggable={false} onError={() => setBroken(true)} style={{ width: size * 0.78, height: size * 0.78, objectFit: "contain" }} />
      </IconTile>
    )
  }
  if (icon?.startsWith("lucide:")) {
    const Custom = LUCIDE_ICONS[icon.slice(7)] ?? Globe
    return (
      <IconTile size={size} background={bg}>
        <Custom size={inner} strokeWidth={1.75} />
      </IconTile>
    )
  }
  const Glyph = glyph.icon
  return (
    <IconTile size={size} background={bg}>
      {Glyph ? (
        <Glyph size={inner} strokeWidth={1.75} />
      ) : (
        <span style={{ fontSize: size * 0.44 }} className="font-semibold">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </IconTile>
  )
}
