// Types mirroring the NodeDesk HTTP API (backend/internal/*).

export interface AuthStatus {
  authenticated: boolean
  setupRequired: boolean
  authDisabled: boolean
  user: string
  version: string
}

export interface Memory { total: number; used: number; percent: number }
export interface Throughput { rx: number; tx: number }
export interface GPU {
  index: number
  vendor: string
  name: string
  util: number
  memUsed: number
  memTotal: number
  temp?: number
  power?: number
}

export interface Sample {
  t: number
  cpu: number
  cores: number[]
  cpuTemp?: number
  load: [number, number, number]
  mem: Memory
  swap: Memory
  gpus: GPU[]
  net: Throughput
  disk: Throughput
  devices?: Record<string, Throughput>
}

export interface SystemInfo {
  hostname: string
  os: string
  kernel: string
  arch: string
  uptime: number
  cpuModel: string
  cores: number
  memTotal: number
  ips: string[]
  gpus: string[]
}

export type AppType = "docker" | "systemd" | "url" | "manual"
export type AppStatus = "running" | "stopped" | "partial" | "failed" | "unknown"

export interface ServiceApp {
  id: string
  name: string
  icon: string
  type: AppType
  url: string
  containers: string[]
  systemdUnits: string[]
  favorite: boolean
  category: string
  order: number
  /** Pinned to the desktop as an icon; desktopX/Y are pixels, -1 when not placed yet. */
  desktop: boolean
  desktopX: number
  desktopY: number
}

export interface ServiceAppView extends ServiceApp {
  status: AppStatus
  running: number
  total: number
}

export interface AppCandidate {
  name: string
  image: string
  state: string
  url: string
  icon?: string
  category?: string
  project?: string
}

export interface DockerStatus {
  available: boolean
  version?: string
  error?: string
  running: number
  total: number
  images: number
}

export interface Port { ip?: string; private: number; public?: number; type: string }
export interface Mount { type: string; name?: string; source: string; destination: string; rw: boolean }

export interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  health?: string
  created: number
  project?: string
  ports: Port[]
  mounts: Mount[]
  meta?: Record<string, string>
}

export interface ContainerStats { cpu: number; memUsed: number; memLimit: number }

export interface DockerImage { id: string; tags: string[]; size: number; created: number; containers: number }

export interface WidgetPlacement {
  instanceId: string
  widgetId: string
  x: number
  y: number
  w: number
  h: number
  z: number
  settings: Record<string, unknown>
}
export interface WidgetLayout { initialized: boolean; widgets: WidgetPlacement[] }

export type FileKind =
  | "folder" | "image" | "video" | "audio" | "pdf" | "markdown" | "json" | "yaml"
  | "log" | "code" | "text" | "archive" | "other"

export interface FileRoot {
  id: string
  name: string
  path: string
  readOnly: boolean
  order: number
  available: boolean
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modTime: number
  mode: string
  kind: FileKind
  mime?: string
  hidden?: boolean
  symlink?: boolean
  broken?: boolean
  editable?: boolean
  items?: number
}

export interface FileListing { root: string; path: string; readOnly: boolean; entries: FileEntry[] }
export interface FileRef { root: string; path: string }
export interface FileInfo extends FileEntry {
  location: string
  owner: string
  group: string
  items?: number
  totalSize?: number
  partial?: boolean
}
export interface TrashItem {
  id: string
  root: string
  rootName: string
  name: string
  originalPath: string
  deletedAt: number
  isDir: boolean
  size: number
  kind: FileKind
}
export interface SearchResult { entries: FileEntry[]; truncated: boolean }
export interface TextFile { content: string; size: number; modTime: number }

export interface Partition {
  name: string
  size: number
  fsType?: string
  label?: string
  mountpoint?: string
  used: number
  free: number
  percent: number
  mounted: boolean
  readOnly?: boolean
}
export interface Disk {
  name: string
  model?: string
  size: number
  kind: "nvme" | "ssd" | "hdd" | "usb" | "virtual"
  removable?: boolean
  temp?: number
  partitions: Partition[]
}
export interface StorageMount {
  name: string
  mountpoint: string
  device: string
  disk?: string
  fsType: string
  total: number
  used: number
  free: number
  percent: number
  kind?: string
  temp?: number
  readOnly?: boolean
}
export interface StorageOverview { disks: Disk[]; mounts: StorageMount[] }
export interface Smart {
  available: boolean
  reason?: string
  passed?: boolean
  temperature?: number
  powerOnHours?: number
  reallocated?: number
  percentUsed?: number
}
export interface Usage { path: string; name: string; size: number; isDir: boolean }
export interface Analysis {
  id: string
  path: string
  status: "running" | "done" | "failed" | "cancelled"
  error?: string
  started: number
  finished?: number
  scanned: number
  bytes: number
  skipped: number
  children: Usage[]
  largest: Usage[]
  fromCache?: boolean
}

export interface AuditEvent { id: number; ts: number; level: string; source: string; message: string }

export type Settings = Partial<{
  theme: "system" | "light" | "dark"
  wallpaper: string
  "dock.size": number
  "dock.magnify": boolean
  clock24h: boolean
  "desktop.watermark": boolean
  "profile.name": string
  "files.favorites": FileRef[]
}>
