import { useMemo } from "react"

import { fileUrl } from "@/services/queries"

export interface WallpaperDef { id: string; name: string; preview: string }

export const WALLPAPERS: WallpaperDef[] = [
  { id: "alpine", name: "Alpine", preview: "linear-gradient(180deg,#8fa9e6,#f2c4b8 55%,#3d5a80)" },
  { id: "dusk", name: "Dusk", preview: "linear-gradient(160deg,#3a3f8f,#b45a9c 55%,#f7a072)" },
  { id: "aurora", name: "Aurora", preview: "linear-gradient(160deg,#0f2a3f,#1f7a8c 50%,#7ee081)" },
  { id: "mist", name: "Mist", preview: "linear-gradient(160deg,#dfe7f3,#c3d0e6 50%,#f1d9e6)" },
  { id: "graphite", name: "Graphite", preview: "linear-gradient(160deg,#1c1f26,#2c3240 60%,#14171c)" },
]

// mulberry32: tiny deterministic PRNG so the generated mountains are identical on every load.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Midpoint displacement between control points, giving a natural jagged ridge line. */
function ridge(ctrl: [number, number][], rand: () => number, roughness: number, depth = 5): [number, number][] {
  let pts = ctrl
  let amp = roughness
  for (let d = 0; d < depth; d++) {
    const next: [number, number][] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      next.push(pts[i])
      next.push([(x1 + x2) / 2, (y1 + y2) / 2 + (rand() - 0.5) * amp * Math.hypot(x2 - x1, 0) * 0.5])
    }
    next.push(pts[pts.length - 1])
    pts = next
    amp *= 0.55
  }
  return pts
}

const path = (pts: [number, number][], closeTo?: number) =>
  `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}` +
  (closeTo !== undefined ? ` L${pts[pts.length - 1][0]},${closeTo} L${pts[0][0]},${closeTo} Z` : "")

function Alpine() {
  const scene = useMemo(() => {
    const r = rng(7)
    const W = 1600, HORIZON = 585
    const far = ridge([[0, 470], [180, 430], [380, 455], [560, 400], [800, 440], [1000, 405], [1250, 445], [1450, 420], [1600, 450]], r, 0.5)
    const main = ridge(
      [[-20, 600], [80, 500], [230, 450], [380, 380], [470, 300], [560, 230], [650, 175], [720, 120], [770, 96], [830, 150], [890, 210], [960, 250], [1050, 300], [1120, 360], [1200, 405], [1300, 450], [1420, 470], [1640, 520], [1640, 600]],
      r, 0.9,
    )
    const right = ridge([[1050, 600], [1160, 470], [1290, 395], [1380, 330], [1450, 300], [1500, 325], [1560, 380], [1640, 430], [1640, 600]], r, 0.7)
    const snowTop = ridge([[560, 232], [640, 190], [700, 150], [770, 92], [830, 150], [890, 205], [940, 240], [880, 232], [820, 200], [770, 160], [720, 215], [660, 232], [610, 262], [560, 232]], r, 0.5, 4)
    const snowRight = ridge([[1380, 332], [1450, 296], [1500, 322], [1550, 370], [1500, 360], [1450, 335], [1410, 360], [1380, 332]], r, 0.4, 4)
    const hills = ridge([[-20, 585], [140, 545], [330, 560], [540, 528], [760, 555], [990, 535], [1200, 558], [1420, 540], [1640, 560], [1640, 620], [-20, 620]], r, 0.35)

    const trees: [number, number][] = []
    for (let x = -10; x < W + 20; x += 7 + r() * 6) {
      const swell = 32 + 26 * Math.sin(x / 210) + 14 * Math.sin(x / 63 + 1.3)
      const h = swell * (0.5 + r() * 0.8)
      trees.push([x, HORIZON - h * 0.55], [x + 4, HORIZON - h - 8 * r()], [x + 8, HORIZON - h * 0.55])
    }
    return { W, HORIZON, far, main, right, snowTop, snowRight, hills, trees }
  }, [])
  const { W, HORIZON } = scene

  const land = (
    <g id="alpine-land">
      <path d={path(scene.far, HORIZON)} fill="url(#far)" opacity="0.7" />
      <path d={path(scene.main, HORIZON)} fill="url(#main)" />
      <path d={path(scene.main, HORIZON)} fill="url(#mainShade)" />
      <path d={path(scene.snowTop)} fill="url(#snow)" opacity="0.92" />
      <path d={path(scene.right, HORIZON)} fill="url(#rightMtn)" />
      <path d={path(scene.snowRight)} fill="url(#snow)" opacity="0.9" />
      <path d={path(scene.hills)} fill="#37587a" opacity="0.92" />
      <path d={`M-10,${HORIZON + 2} L${scene.trees.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${W + 20},${HORIZON + 2} Z`} fill="#1c3a45" />
    </g>
  )

  return (
    <svg viewBox={`0 0 ${W} 900`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6c98de" />
          <stop offset="0.35" stopColor="#a4b6e8" />
          <stop offset="0.6" stopColor="#e8c3d0" />
          <stop offset="0.85" stopColor="#f7c8b4" />
          <stop offset="1" stopColor="#fbd2b2" />
        </linearGradient>
        <radialGradient id="sun" cx="0.8" cy="0.72" r="0.5">
          <stop offset="0" stopColor="#ffd6a8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffd6a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="far" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a7a4d6" />
          <stop offset="1" stopColor="#d9b5c8" />
        </linearGradient>
        <linearGradient id="main" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4d6390" />
          <stop offset="0.42" stopColor="#7b7aa8" />
          <stop offset="0.6" stopColor="#d59a9c" />
          <stop offset="0.85" stopColor="#f0a58b" />
          <stop offset="1" stopColor="#e28f83" />
        </linearGradient>
        <linearGradient id="mainShade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.6" stopColor="#3b4f7c" stopOpacity="0.15" />
          <stop offset="1" stopColor="#25405f" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="rightMtn" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8a7fa6" />
          <stop offset="1" stopColor="#f0a690" />
        </linearGradient>
        <linearGradient id="snow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#e8eefc" />
          <stop offset="0.55" stopColor="#fbe7e6" />
          <stop offset="1" stopColor="#ffd2c0" />
        </linearGradient>
        <linearGradient id="lake" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#86a6d0" />
          <stop offset="0.5" stopColor="#496f9e" />
          <stop offset="1" stopColor="#233f66" />
        </linearGradient>
        <filter id="blurR" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="1.5 7" />
        </filter>
      </defs>

      <rect width={W} height="900" fill="url(#sky)" />
      <rect width={W} height={HORIZON} fill="url(#sun)" />
      {land}

      <rect y={HORIZON} width={W} height={900 - HORIZON} fill="url(#lake)" />
      <g transform={`translate(0 ${HORIZON * 2}) scale(1 -1)`} opacity="0.55" filter="url(#blurR)" clipPath="url(#lakeClip)">
        {land}
      </g>
      <clipPath id="lakeClip"><rect y="0" width={W} height={HORIZON} /></clipPath>
      <rect y={HORIZON} width={W} height="6" fill="#0d1b2a" opacity="0.18" />
      {[640, 700, 770, 850].map((y, i) => (
        <rect key={y} x={120 + i * 230} y={y} width={300 - i * 40} height="1.6" rx="1" fill="#fff" opacity="0.08" />
      ))}
      <path d="M1180,900 L1290,835 L1380,850 L1450,800 L1600,780 L1600,900 Z" fill="#1a2838" />
      <path d="M1330,900 L1420,860 L1500,872 L1600,838 L1600,900 Z" fill="#243447" />
    </svg>
  )
}

const CSS_WALLPAPERS: Record<string, string> = {
  dusk: "linear-gradient(160deg,#2f3480 0%,#a24d96 52%,#f7a072 100%)",
  aurora:
    "radial-gradient(120% 80% at 20% 90%,#7ee08155,transparent 60%),radial-gradient(100% 70% at 80% 10%,#4fb3d966,transparent 60%),linear-gradient(160deg,#0b2236,#134e5e 60%,#0e3b3a)",
  mist: "radial-gradient(90% 70% at 20% 10%,#ffffffaa,transparent 60%),linear-gradient(160deg,#d7e2f3,#bccbe4 55%,#eed7e6)",
  graphite: "radial-gradient(80% 60% at 70% 0%,#39425466,transparent 60%),linear-gradient(160deg,#171a20,#2a303c 60%,#12151a)",
}

export function Wallpaper({ value }: { value: string }) {
  let inner: React.ReactNode
  if (value === "builtin:alpine" || (value.startsWith("builtin:") && !CSS_WALLPAPERS[value.slice(8)])) {
    inner = <Alpine />
  } else if (value.startsWith("builtin:")) {
    inner = <div className="absolute inset-0" style={{ background: CSS_WALLPAPERS[value.slice(8)] }} />
  } else {
    let url = value
    if (value.startsWith("file:")) {
      const [root, ...rest] = value.slice(5).split(":")
      url = fileUrl.raw(root, rest.join(":"))
    }
    inner = <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }} />
  }
  return <div className="absolute inset-0 -z-0 overflow-hidden bg-slate-700">{inner}</div>
}
