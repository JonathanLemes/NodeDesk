interface RingProps {
  /** 0–100 */
  value: number
  color: string
  size?: number
  stroke?: number
  label: string
  /** Text shown in the centre. Defaults to the rounded percentage. */
  text?: string
}

/** Circular gauge used by the System widget: a soft track and one coloured arc. */
export function Ring({ value, color, size = 86, stroke = 9, label, text }: RingProps) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  // Keep a visible dot for very small values so an idle ring still reads as "alive".
  const dash = Math.max(v > 0 ? stroke * 0.6 : 0, (v / 100) * c)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
            style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[19px] font-semibold tabular-nums tracking-tight">
          {text ?? `${Math.round(v)}%`}
        </div>
      </div>
      <span className="text-[13px] text-foreground/80">{label}</span>
    </div>
  )
}
