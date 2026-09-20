import { t } from "@/i18n"

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

export function describeKind(name: string, kind: string): string {
  if (kind === "folder") return t("kind.folder")
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toUpperCase() : ""
  switch (kind) {
    case "image": return t("kind.image", { ext: ext || "—" })
    case "video": return t("kind.video", { ext: ext || "—" })
    case "audio": return t("kind.audio", { ext: ext || "—" })
    case "archive": return t("kind.archive", { ext: ext || "—" })
    case "code": case "other": return ext ? t("kind.file_ext", { ext }) : t("kind.file")
    case "pdf": return t("kind.pdf")
    case "markdown": return t("kind.markdown")
    case "json": return t("kind.json")
    case "yaml": return t("kind.yaml")
    case "log": return t("kind.log")
    case "text": return t("kind.text")
  }
  return t("kind.file")
}
