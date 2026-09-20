import { useEffect } from "react"


import { useAppHeight } from "@/mobile/useAppHeight"
import { HomeScreen } from "@/mobile/HomeScreen"
import { MobileFrame } from "@/mobile/MobileFrame"
import { Wallpaper } from "@/desktop/wallpapers"
import { useLiveStreams } from "@/hooks/useLiveStreams"
import { useSetting } from "@/hooks/useSetting"
import { useWindows } from "@/stores/windows"

/** Phone layout: the home screen with apps opening as full-screen pages on top of it. */
export function MobileShell() {
  useLiveStreams(true)
  useAppHeight()
  const [wallpaper] = useSetting("wallpaper")
  const windows = useWindows((s) => s.windows).filter((w) => !w.minimized)
  const topId = windows.reduce<string | null>((best, w) => (best === null || w.z > (windows.find((x) => x.id === best)?.z ?? -1) ? w.id : best), null)

  // The browser/OS back gesture closes the top app instead of leaving NodeDesk.
  const count = windows.length
  useEffect(() => {
    let pushed = 0
    const unsub = useWindows.subscribe((s, prev) => {
      if (s.windows.length > prev.windows.length) {
        history.pushState({ nodedesk: true }, "")
        pushed++
      }
    })
    const onPop = () => {
      const { windows: ws, close } = useWindows.getState()
      const top = [...ws].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
      if (top) {
        close(top.id)
        pushed = Math.max(0, pushed - 1)
      }
    }
    window.addEventListener("popstate", onPop)
    return () => {
      unsub()
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  const back = () => {
    if (history.state?.nodedesk) history.back()
    else if (topId) useWindows.getState().close(topId)
  }

  return (
    <div className="fixed top-0 left-0 w-full overflow-hidden" style={{ height: "var(--app-h, 100dvh)" }} data-windows={count}>
      <Wallpaper value={wallpaper} />
      <HomeScreen />
      {windows.map((w) => <MobileFrame key={w.id} win={w} top={w.id === topId} onBack={back} />)}
    </div>
  )
}
