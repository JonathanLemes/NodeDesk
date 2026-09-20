export const parentOf = (p: string) => {
  const i = p.lastIndexOf("/")
  return i <= 0 ? "/" : p.slice(0, i)
}
export const joinPath = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`)
export const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1)

/** "/a/b" -> [{name:"a", path:"/a"}, {name:"b", path:"/a/b"}] */
export function crumbsOf(p: string): { name: string; path: string }[] {
  const parts = p.split("/").filter(Boolean)
  return parts.map((name, i) => ({ name, path: "/" + parts.slice(0, i + 1).join("/") }))
}

const KIND_LABEL: Record<string, string> = {
  folder: "Folder", image: "image", video: "video", audio: "audio", pdf: "PDF document", markdown: "Markdown document",
  json: "JSON document", yaml: "YAML document", log: "Log file", code: "Source file", text: "Text document", archive: "Archive", other: "Document",
}

export function describeKind(name: string, kind: string): string {
  if (kind === "folder") return "Folder"
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toUpperCase() : ""
  if (["image", "video", "audio"].includes(kind)) return `${ext || "Media"} ${KIND_LABEL[kind]}`
  if (kind === "archive") return `${ext || "Archive"} archive`
  if (kind === "code" || kind === "other") return ext ? `${ext} file` : "File"
  return KIND_LABEL[kind] ?? "File"
}
