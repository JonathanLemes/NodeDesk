import { useEffect } from "react"

/**
 * Publishes the real usable height as --app-h.
 *
 * iOS home-screen apps (standalone PWAs) often report a layout viewport shorter than the screen,
 * which leaves a band at the bottom. In standalone mode the screen height is the truth, so use it.
 */
export function useAppHeight() {
  useEffect(() => {
    const root = document.documentElement
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    const apply = () => {
      const portrait = window.innerHeight >= window.innerWidth
      let h = window.visualViewport?.height ?? window.innerHeight
      if (standalone && portrait) h = Math.max(h, window.innerHeight, Math.max(screen.width, screen.height))
      root.style.setProperty("--app-h", `${Math.round(h)}px`)
    }
    apply()
    window.addEventListener("resize", apply)
    window.addEventListener("orientationchange", apply)
    window.visualViewport?.addEventListener("resize", apply)
    // Matches the wallpaper so any sliver outside the app is not a jarring different colour.
    const prev = root.style.background
    root.style.background = "#0c1526"
    return () => {
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
      window.visualViewport?.removeEventListener("resize", apply)
      root.style.removeProperty("--app-h")
      root.style.background = prev
    }
  }, [])
}
