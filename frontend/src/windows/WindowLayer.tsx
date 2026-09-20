import { useWindows } from "@/stores/windows"
import { WindowFrame } from "@/windows/WindowFrame"

export function WindowLayer() {
  const windows = useWindows((s) => s.windows)
  return (
    <>
      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} />
      ))}
    </>
  )
}
