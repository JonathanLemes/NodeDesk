import { locale } from "@/i18n"

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

/** Locale-aware fixed-decimals number (decimal comma in Portuguese). */
export function num(n: number, digits = 0): string {
  return n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatBytes(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B"
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1000)), UNITS.length - 1)
  const v = n / 1000 ** i
  return `${num(v, v >= 100 || i === 0 ? 0 : digits)} ${UNITS[i]}`
}

/** Compact capacity like "312 GB / 1 TB" building blocks. */
export function formatCapacity(n: number): string {
  if (n <= 0) return "0 B"
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1000)), UNITS.length - 1)
  const v = n / 1000 ** i
  return `${num(v, v >= 10 || Number.isInteger(v) ? 0 : 1)} ${UNITS[i]}`
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatPercent(n: number, digits = 0): string {
  return `${num(n, digits)}%`
}

export function formatDate(ms: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString(locale(), opts ?? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Replaces the {host} placeholder with the hostname the browser used to reach NodeDesk. */
export function resolveUrl(url: string): string {
  return url.replace("{host}", window.location.hostname)
}
