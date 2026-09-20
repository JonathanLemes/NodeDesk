import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, qs } from "@/services/api"
import type {
  Analysis, AppCandidate, AuditEvent, AuthStatus, Container, ContainerStats, DockerImage, DockerStatus,
  FileEntry, FileInfo, FileListing, FileRef, FileRoot, SearchResult, ServiceApp, ServiceAppView, Settings,
  Smart, StorageOverview, SystemInfo, TextFile, TrashItem, WidgetLayout,
} from "@/types/api"

export const keys = {
  auth: ["auth"] as const,
  system: ["system"] as const,
  settings: ["settings"] as const,
  widgets: ["widgets"] as const,
  apps: ["apps"] as const,
  discover: ["apps", "discover"] as const,
  docker: ["docker"] as const,
  dockerStats: ["docker", "stats"] as const,
  images: ["docker", "images"] as const,
  roots: ["files", "roots"] as const,
  list: (root: string, path: string) => ["files", "list", root, path] as const,
  trash: ["files", "trash"] as const,
  storage: ["storage"] as const,
  audit: ["audit"] as const,
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong"
}

// ---------------------------------------------------------------- auth
export const useAuth = () =>
  useQuery({ queryKey: keys.auth, queryFn: () => api.get<AuthStatus>("/api/auth/status"), staleTime: 30_000, retry: false })

// ------------------------------------------------------------- system
export const useSystemInfo = () =>
  useQuery({ queryKey: keys.system, queryFn: () => api.get<SystemInfo>("/api/system/info"), staleTime: 60_000 })

// ----------------------------------------------------------- settings
export function useSettings() {
  const { data: auth } = useAuth()
  // Settings are private: do not ask for them before signing in.
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api.get<Settings>("/api/settings"),
    staleTime: Infinity,
    enabled: !!auth?.authenticated,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Settings) => api.put("/api/settings", patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.settings })
      const prev = qc.getQueryData<Settings>(keys.settings)
      qc.setQueryData<Settings>(keys.settings, { ...prev, ...patch })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.settings, ctx.prev)
      toast.error(errorMessage(e))
    },
  })
}

// ------------------------------------------------------------ widgets
export const useWidgetLayout = () =>
  useQuery({ queryKey: keys.widgets, queryFn: () => api.get<WidgetLayout>("/api/widgets"), staleTime: Infinity })

// --------------------------------------------------------------- apps
export const useApps = () =>
  useQuery({ queryKey: keys.apps, queryFn: () => api.get<ServiceAppView[]>("/api/apps"), staleTime: 10_000, refetchInterval: 30_000 })

export const useDiscover = (enabled: boolean) =>
  useQuery({ queryKey: keys.discover, queryFn: () => api.get<AppCandidate[]>("/api/apps/discover"), enabled })

export function useAppMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.apps })
  const onError = (e: unknown) => toast.error(errorMessage(e))
  return {
    create: useMutation({ mutationFn: (a: Partial<ServiceApp>) => api.post<ServiceApp>("/api/apps", a), onSuccess: refresh, onError }),
    update: useMutation({
      mutationFn: (a: Partial<ServiceApp> & { id: string }) => api.put<ServiceApp>(`/api/apps/${a.id}`, a),
      onSuccess: refresh, onError,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del(`/api/apps/${id}`), onSuccess: refresh, onError }),
    action: useMutation({
      mutationFn: (v: { id: string; action: "start" | "stop" | "restart" }) => api.post(`/api/apps/${v.id}/${v.action}`),
      onSuccess: () => {
        refresh()
        qc.invalidateQueries({ queryKey: keys.docker })
      },
      onError,
    }),
  }
}

// ------------------------------------------------------------- docker
export const useDockerStatus = () =>
  useQuery({ queryKey: [...keys.docker, "status"], queryFn: () => api.get<DockerStatus>("/api/docker/status"), staleTime: 15_000 })

export const useContainers = () =>
  useQuery({ queryKey: [...keys.docker, "containers"], queryFn: () => api.get<Container[]>("/api/docker/containers"), staleTime: 5_000 })

export const useContainerStats = (enabled: boolean) =>
  useQuery({
    queryKey: keys.dockerStats,
    queryFn: () => api.get<Record<string, ContainerStats>>("/api/docker/stats"),
    enabled,
    refetchInterval: enabled ? 5_000 : false,
    refetchIntervalInBackground: false,
  })

export const useImages = (enabled: boolean) =>
  useQuery({ queryKey: keys.images, queryFn: () => api.get<DockerImage[]>("/api/docker/images"), enabled })

export function useContainerAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; action: "start" | "stop" | "restart" }) => api.post(`/api/docker/containers/${v.id}/${v.action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.docker })
      qc.invalidateQueries({ queryKey: keys.apps })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// -------------------------------------------------------------- files
export const useRoots = () => useQuery({ queryKey: keys.roots, queryFn: () => api.get<FileRoot[]>("/api/files/roots"), staleTime: 60_000 })

export const useListing = (root: string | undefined, path: string, enabled = true) =>
  useQuery({
    queryKey: keys.list(root ?? "", path),
    queryFn: () => api.get<FileListing>(`/api/files/list${qs({ root, path })}`),
    enabled: enabled && !!root,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })

export const useTrash = (enabled = true) =>
  useQuery({ queryKey: keys.trash, queryFn: () => api.get<TrashItem[]>("/api/files/trash"), enabled })

export const useSearch = (root: string | undefined, path: string, q: string) =>
  useQuery({
    queryKey: ["files", "search", root, path, q],
    queryFn: ({ signal }) => api.get<SearchResult>(`/api/files/search${qs({ root, path, q })}`, { signal }),
    enabled: !!root && q.trim().length > 0,
    staleTime: 10_000,
  })

export const useFileInfo = (ref: FileRef | null, withSize = false) =>
  useQuery({
    queryKey: ["files", "info", ref?.root, ref?.path, withSize],
    queryFn: () => api.get<FileInfo>(`/api/files/info${qs({ root: ref!.root, path: ref!.path, size: withSize ? 1 : undefined })}`),
    enabled: !!ref,
  })

export const filesApi = {
  mkdir: (root: string, path: string, name: string) => api.post<FileEntry>("/api/files/mkdir", { root, path, name }),
  create: (root: string, path: string, name: string) => api.post<FileEntry>("/api/files/create", { root, path, name }),
  rename: (root: string, path: string, name: string) => api.post<FileEntry>("/api/files/rename", { root, path, name }),
  move: (items: FileRef[], to: FileRef) => api.post<{ items: FileRef[] }>("/api/files/move", { items, to }),
  copy: (items: FileRef[], to: FileRef) => api.post<{ items: FileRef[] }>("/api/files/copy", { items, to }),
  remove: (items: FileRef[], permanent = false) => api.post("/api/files/delete", { items, permanent }),
  readText: (root: string, path: string) => api.get<TextFile>(`/api/files/text${qs({ root, path })}`),
  writeText: (root: string, path: string, content: string, modTime: number) =>
    api.put<TextFile>("/api/files/text", { root, path, content, modTime }),
  restore: (root: string, id: string) => api.post<FileRef>("/api/files/trash/restore", { root, id }),
  purge: (root?: string, id?: string) => api.post("/api/files/trash/purge", { root: root ?? "", id: id ?? "" }),
}

export const fileUrl = {
  raw: (root: string, path: string) => `/api/files/raw${qs({ root, path })}`,
  download: (root: string, paths: string[]) => {
    const u = new URLSearchParams({ root })
    paths.forEach((p) => u.append("path", p))
    return `/api/files/download?${u.toString()}`
  },
}

export function useRootMutations() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.roots })
  const onError = (e: unknown) => toast.error(errorMessage(e))
  return {
    add: useMutation({
      mutationFn: (v: { name: string; path: string; readOnly: boolean }) => api.post<FileRoot>("/api/files/roots", v),
      onSuccess: refresh, onError,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; name: string; readOnly: boolean }) => api.patch(`/api/files/roots/${v.id}`, v),
      onSuccess: refresh, onError,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.del(`/api/files/roots/${id}`), onSuccess: refresh, onError }),
  }
}

// ------------------------------------------------------------ storage
export const useStorage = () =>
  useQuery({ queryKey: keys.storage, queryFn: () => api.get<StorageOverview>("/api/storage"), staleTime: 10_000, refetchInterval: 30_000, refetchIntervalInBackground: false })

export const useSmart = (disk: string | null) =>
  useQuery({ queryKey: ["storage", "smart", disk], queryFn: () => api.get<Smart>(`/api/storage/smart/${disk}`), enabled: !!disk, staleTime: 600_000 })

export const storageApi = {
  analyze: (path: string, force = false) => api.post<Analysis>("/api/storage/analyze", { path, force }),
  get: (id: string) => api.get<Analysis>(`/api/storage/analyze/${id}`),
  cancel: (id: string) => api.del(`/api/storage/analyze/${id}`),
}

// -------------------------------------------------------------- audit
export const useAudit = () => useQuery({ queryKey: keys.audit, queryFn: () => api.get<AuditEvent[]>("/api/audit") })
