import { ArrowDownToLine, Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { api } from "@/services/api"

const MAX_LINES = 2000

/** Tails a container's logs. Running containers stream over SSE; stopped ones show the last lines once. */
export function LogViewer({ id, running }: { id: string; running: boolean }) {
  const [lines, setLines] = useState<string[]>([])
  const [live, setLive] = useState(true)
  const [stick, setStick] = useState(true)
  const box = useRef<HTMLPreElement>(null)

  useEffect(() => {
    setLines([])
    if (!running) {
      let cancelled = false
      api.get<{ lines: string[] }>(`/api/docker/containers/${id}/logs?tail=300`).then((r) => !cancelled && setLines(r.lines)).catch(() => {})
      return () => { cancelled = true }
    }
    if (!live) return
    const es = new EventSource(`/api/docker/containers/${id}/logs/stream?tail=200`)
    let buf: string[] = []
    let timer: number | undefined
    const flush = () => {
      timer = undefined
      const chunk = buf
      buf = []
      setLines((cur) => [...cur, ...chunk].slice(-MAX_LINES))
    }
    es.addEventListener("line", (e) => {
      buf.push(JSON.parse((e as MessageEvent).data))
      timer ??= window.setTimeout(flush, 120) // batch bursts into one render
    })
    es.addEventListener("end", () => es.close())
    es.onerror = () => es.close()
    return () => { es.close(); window.clearTimeout(timer) }
  }, [id, running, live])

  useEffect(() => {
    const el = box.current
    if (el && stick) el.scrollTop = el.scrollHeight
  }, [lines, stick])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-2">
        <span className="flex-1 text-xs text-muted-foreground">{lines.length} lines</span>
        {running && (
          <Button size="xs" variant="ghost" onClick={() => setLive(!live)}>{live ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{live ? "Pause" : "Follow"}</Button>
        )}
        <Button size="xs" variant={stick ? "secondary" : "ghost"} onClick={() => setStick(!stick)}><ArrowDownToLine data-icon="inline-start" />Auto-scroll</Button>
      </div>
      <pre
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          if (!atEnd && stick) setStick(false)
        }}
        className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap"
      >
        {lines.length === 0 ? <span className="text-muted-foreground">No log output.</span> : lines.map((l, i) => <div key={i}>{l}</div>)}
      </pre>
    </div>
  )
}
