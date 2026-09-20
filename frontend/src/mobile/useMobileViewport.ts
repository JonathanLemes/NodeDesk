import { useEffect } from "react"

/** CSS colour (oklch, var…) -> "rgb(r,g,b)" via a canvas, for the places that only take plain colours. */
function toRgb(css: string): string | null {
  try {
    const ctx = document.createElement("canvas").getContext("2d")
    if (!ctx) return null
    ctx.canvas.width = ctx.canvas.height = 1
    ctx.fillStyle = "#000"
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  } catch {
    return null
  }
}

const HOME_COLOR = "#0c1526" // matches the top of the default wallpaper

/**
 * Phone-only page plumbing, applied to <html>:
 *
 *  - `data-mobile`: switches off text selection / the long-press callout (see index.css).
 *  - the on-screen keyboard: on iOS it covers the page instead of resizing it, so while it is open
 *    `--vv-top` / `--vv-h` describe the visible area and full-screen pages follow it.
 *  - the colour behind the status bar. iOS paints its top edge from the page background and
 *    `theme-color`; when those differ from the app's own header you get a faint gradient band.
 *    So they follow what is at the top: the wallpaper on the home screen, the window colour in an app.
 */
export function useMobileViewport(appOpen: boolean, dark: boolean) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.mobile = ""
    const vv = window.visualViewport
    const apply = () => {
      if (vv && window.innerHeight - vv.height > 100) {
        root.style.setProperty("--vv-top", `${Math.round(vv.offsetTop)}px`)
        root.style.setProperty("--vv-h", `${Math.round(vv.height)}px`)
        root.dataset.keyboard = ""
      } else {
        root.style.removeProperty("--vv-top")
        root.style.removeProperty("--vv-h")
        delete root.dataset.keyboard
      }
    }
    apply()
    vv?.addEventListener("resize", apply)
    vv?.addEventListener("scroll", apply)
    return () => {
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      delete root.dataset.mobile
      delete root.dataset.keyboard
      root.style.removeProperty("--vv-top")
      root.style.removeProperty("--vv-h")
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const prevMeta = meta?.content
    const prevBg = root.style.background
    const prevBodyBg = document.body.style.background
    const color = appOpen ? (toRgb(getComputedStyle(root).getPropertyValue("--window").trim()) ?? HOME_COLOR) : HOME_COLOR
    // iOS paints anything outside the WebView (the status bar edge, and the bottom band when WebKit
    // undercounts the viewport) from the *body* background, so both follow the screen's colour.
    root.style.background = color
    document.body.style.background = color
    if (meta) meta.content = color
    return () => {
      root.style.background = prevBg
      document.body.style.background = prevBodyBg
      if (meta && prevMeta !== undefined) meta.content = prevMeta
    }
  }, [appOpen, dark])
}
