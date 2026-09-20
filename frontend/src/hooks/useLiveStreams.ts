import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { api } from "@/services/api"
import { keys } from "@/services/queries"
import { useMetrics } from "@/stores/metrics"
import type { Sample } from "@/types/api"

/**
 * Opens the metrics (1 Hz) and change-notification SSE streams while the tab is visible.
 * Hidden tabs disconnect, which lets the backend stop sampling entirely.
 */
export function useLiveStreams(enabled: boolean) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    let metrics: EventSource | null = null
    let events: EventSource | null = null
    let retry: number | undefined
    let cancelled = false

    const { push, seed, setConnected } = useMetrics.getState()

    const connect = () => {
      if (cancelled || document.visibilityState === "hidden") return
      api.get<Sample[]>("/api/metrics/history").then(seed).catch(() => {})

      metrics = new EventSource("/api/metrics/stream")
      metrics.addEventListener("sample", (e) => {
        setConnected(true)
        push(JSON.parse((e as MessageEvent).data) as Sample)
      })
      metrics.onerror = () => {
        setConnected(false)
        metrics?.close()
        metrics = null
        window.clearTimeout(retry)
        retry = window.setTimeout(connect, 3000)
      }

      events = new EventSource("/api/events")
      events.addEventListener("change", (e) => {
        const { topic } = JSON.parse((e as MessageEvent).data) as { topic: string }
        if (topic === "docker") {
          // Only the cheap lists; stats have their own 5 s poll while the Docker window is visible.
          qc.invalidateQueries({ queryKey: [...keys.docker, "containers"] })
          qc.invalidateQueries({ queryKey: [...keys.docker, "status"] })
          qc.invalidateQueries({ queryKey: keys.apps })
        }
      })
      events.onerror = () => {
        events?.close()
        events = null
      }
    }

    const disconnect = () => {
      window.clearTimeout(retry)
      metrics?.close()
      events?.close()
      metrics = events = null
      setConnected(false)
    }

    const onVisibility = () => {
      disconnect()
      if (document.visibilityState === "visible") connect()
    }

    connect()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      disconnect()
    }
  }, [enabled, qc])
}
