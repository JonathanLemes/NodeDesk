import { useId } from "react"

interface AreaChartProps {
  data: number[]
  /** Fixed max for the y axis; when omitted the chart scales to the data. */
  max?: number
  color?: string
  height?: number
  points?: number
}

/** A dependency-free area chart. `data` is drawn right-aligned across `points` slots. */
export function AreaChart({ data, max, color = "var(--primary)", height = 120, points = 60 }: AreaChartProps) {
  const id = useId()
  const w = 600
  const slice = data.slice(-points)
  const top = max ?? Math.max(1, ...slice) * 1.15
  const step = w / (points - 1)
  const offset = (points - slice.length) * step
  const coords = slice.map((v, i) => [offset + i * step, height - (Math.min(v, top) / top) * (height - 2) - 1] as const)
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const area = coords.length ? `${line} L${coords[coords.length - 1][0]},${height} L${coords[0][0]},${height} Z` : ""

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />
      ))}
      {area && <path d={area} fill={`url(#${id})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** Tiny axis-free version for lists. */
export function Sparkline({ data, max, color, points = 40 }: Omit<AreaChartProps, "height">) {
  return <AreaChart data={data} max={max} color={color} height={32} points={points} />
}
