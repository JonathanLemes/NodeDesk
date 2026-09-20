import { useEffect, useRef } from "react"

interface RenameInputProps {
  initial: string
  isDir: boolean
  onCommit: (name: string) => void
  onCancel: () => void
  className?: string
}

/** Inline rename field: selects the base name (not the extension) like a real file manager. */
export function RenameInput({ initial, isDir, onCommit, onCancel, className }: RenameInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Deferred so it wins over a closing menu handing focus back to its trigger.
    const t = window.setTimeout(() => {
      el.focus()
      const dot = initial.lastIndexOf(".")
      el.setSelectionRange(0, !isDir && dot > 0 ? dot : initial.length)
    }, 60)
    return () => window.clearTimeout(t)
  }, [initial, isDir])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const v = ref.current?.value.trim() ?? ""
    if (commit && v && v !== initial) onCommit(v)
    else onCancel()
  }

  return (
    <input
      ref={ref}
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") finish(true)
        else if (e.key === "Escape") finish(false)
      }}
      onBlur={() => finish(true)}
      className={className ?? "w-full rounded-[5px] border border-primary bg-background px-1 py-0.5 text-center text-[12.5px] outline-none ring-2 ring-primary/30"}
    />
  )
}
