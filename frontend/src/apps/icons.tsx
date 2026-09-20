import { Activity, Settings } from "lucide-react"

import { IconTile } from "@/components/IconTile"

/** Dock icons for the built-in applications. */

export function AppsIcon({ size }: { size: number }) {
  const s = size * 0.2
  return (
    <IconTile size={size} background="linear-gradient(160deg, #8a7dff, #5b4ae0)">
      <div className="grid grid-cols-2 gap-[3px]" style={{ gap: size * 0.05 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="bg-white/95" style={{ width: s, height: s, borderRadius: s * 0.28 }} />)}
      </div>
    </IconTile>
  )
}

export function DockerIcon({ size }: { size: number }) {
  return (
    <IconTile size={size} background="linear-gradient(160deg, #46a0ff, #1e6fe0)">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="#fff">
        {[[6, 10], [10.5, 10], [15, 10], [10.5, 6], [15, 6], [19.5, 10]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3.6" height="3.2" rx="0.6" />
        ))}
        <path d="M2 16.2h21.4c1-.1 2.2-.6 2.7-1.6.9.3 1.9.2 2.6-.1-.4-1.2-1.1-1.7-1.6-2-.2-1.1-.8-1.8-1.4-2.2-.8.9-.9 2.2-.5 3.1-.6.3-1.2.4-1.7.4H2z M3.4 17.6c.2 3.5 2.6 6.9 8.2 6.9 6.2 0 10.2-2.9 11.6-8.1H3.4z" fillRule="evenodd" />
      </svg>
    </IconTile>
  )
}

export function FolderGlyph({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 64 51" className={className} aria-hidden>
      <defs>
        <linearGradient id="fBack" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4aa8ff" /><stop offset="1" stopColor="#2b86f0" /></linearGradient>
        <linearGradient id="fFront" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7cc4ff" /><stop offset="1" stopColor="#3b95f5" /></linearGradient>
      </defs>
      <path d="M4 6a4 4 0 0 1 4-4h14.5a4 4 0 0 1 2.9 1.2l3.2 3.3A4 4 0 0 0 31.5 8H56a4 4 0 0 1 4 4v3H4z" fill="url(#fBack)" />
      <rect x="4" y="12" width="56" height="37" rx="4.5" fill="url(#fFront)" />
      <rect x="4" y="12" width="56" height="1.4" fill="#fff" opacity="0.45" />
    </svg>
  )
}

export function FilesIcon({ size }: { size: number }) {
  return (
    <IconTile size={size} background="linear-gradient(180deg, #ffffff, #e6eaf2)" className="text-foreground">
      <FolderGlyph size={size * 0.68} />
    </IconTile>
  )
}

export function StorageIcon({ size }: { size: number }) {
  const w = size * 0.56
  return (
    <IconTile size={size} background="linear-gradient(160deg, #9aa0aa, #5d636d)">
      <div className="flex flex-col" style={{ gap: size * 0.05 }}>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-end bg-white/90" style={{ width: w, height: size * 0.2, borderRadius: size * 0.07, paddingRight: size * 0.05 }}>
            <div className="rounded-full bg-[#5d636d]" style={{ width: size * 0.05, height: size * 0.05 }} />
          </div>
        ))}
      </div>
    </IconTile>
  )
}

export function MonitorIcon({ size }: { size: number }) {
  return (
    <IconTile size={size} background="linear-gradient(160deg, #1f4d3a, #0c1f18)">
      <Activity size={size * 0.56} strokeWidth={2} className="text-[#5eea9c]" />
    </IconTile>
  )
}

export function SettingsIcon({ size }: { size: number }) {
  return (
    <IconTile size={size} background="linear-gradient(160deg, #d6d9de, #8d929b)">
      <Settings size={size * 0.62} strokeWidth={1.5} className="text-[#3d4148]" />
    </IconTile>
  )
}

export function TerminalIcon({ size }: { size: number }) {
  return (
    <IconTile size={size} background="linear-gradient(160deg, #3d3d42, #0e0e10)">
      <span className="font-mono leading-none font-bold text-white" style={{ fontSize: size * 0.34, letterSpacing: -size * 0.01 }}>&gt;_</span>
    </IconTile>
  )
}
