import { fileUrl } from "@/services/queries"
import { t } from "@/i18n"

/** Shipped with the app (frontend/public/wallpapers, credit in SOURCE.md there). */
export const DEFAULT_WALLPAPER_URL = "/wallpapers/default.jpg"

export interface WallpaperDef { id: string; name: string; preview: string }

export const WALLPAPERS: WallpaperDef[] = [
  {
    id: "dunes",
    get name() {
      return t("wallpaper.dunes")
    },
    preview: `url(${DEFAULT_WALLPAPER_URL}) center / cover`,
  },
  { id: "dusk", get name() {
      return t("wallpaper.dusk")
    }, preview: "linear-gradient(160deg,#3a3f8f,#b45a9c 55%,#f7a072)" },
  { id: "aurora", get name() {
      return t("wallpaper.aurora")
    }, preview: "linear-gradient(160deg,#0f2a3f,#1f7a8c 50%,#7ee081)" },
  { id: "mist", get name() {
      return t("wallpaper.mist")
    }, preview: "linear-gradient(160deg,#dfe7f3,#c3d0e6 50%,#f1d9e6)" },
  { id: "graphite", get name() {
      return t("wallpaper.graphite")
    }, preview: "linear-gradient(160deg,#1c1f26,#2c3240 60%,#14171c)" },
]

const CSS_WALLPAPERS: Record<string, string> = {
  dusk: "linear-gradient(160deg,#2f3480 0%,#a24d96 52%,#f7a072 100%)",
  aurora:
    "radial-gradient(120% 80% at 20% 90%,#7ee08155,transparent 60%),radial-gradient(100% 70% at 80% 10%,#4fb3d966,transparent 60%),linear-gradient(160deg,#0b2236,#134e5e 60%,#0e3b3a)",
  mist: "radial-gradient(90% 70% at 20% 10%,#ffffffaa,transparent 60%),linear-gradient(160deg,#d7e2f3,#bccbe4 55%,#eed7e6)",
  graphite: "radial-gradient(80% 60% at 70% 0%,#39425466,transparent 60%),linear-gradient(160deg,#171a20,#2a303c 60%,#12151a)",
}

export function Wallpaper({ value }: { value: string }) {
  let inner: React.ReactNode
  const builtin = value.startsWith("builtin:") ? value.slice(8) : null
  if (builtin && CSS_WALLPAPERS[builtin]) {
    inner = <div className="absolute inset-0" style={{ background: CSS_WALLPAPERS[builtin] }} />
  } else {
    // "builtin:dunes" and any unknown/legacy built-in id use the shipped photo.
    let url = DEFAULT_WALLPAPER_URL
    if (!builtin) {
      url = value
      if (value.startsWith("file:")) {
        const [root, ...rest] = value.slice(5).split(":")
        url = fileUrl.raw(root, rest.join(":"))
      }
    }
    inner = <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }} />
  }
  return <div className="absolute inset-0 -z-0 overflow-hidden bg-[#0c1526]">{inner}</div>
}
