import { useSyncExternalStore } from "react"

/** Phone layout below Tailwind's `md` breakpoint (768 px). */
const QUERY = "(max-width: 767px)"

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

export const isMobileNow = () => window.matchMedia(QUERY).matches

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, isMobileNow, () => false)
}
