import type { Terminal } from "@xterm/xterm"

/**
 * Drag-to-scroll (with momentum) for touch screens. xterm 6 keeps its native scroller underneath
 * the text layer, so a finger dragging over the text scrolled nothing: only the scrollbar worked.
 *
 * On the alternate screen (less, vim, top…) there is no scrollback, so the drag is sent as arrow
 * keys, unless the program tracks the mouse itself.
 */
export function installTouchScroll(el: HTMLElement, term: Terminal, send: (data: string) => void): () => void {
  let lastY = 0
  let lastT = 0
  let acc = 0 // px not yet turned into whole lines
  let velocity = 0 // px per ms, finger-up positive
  let raf = 0
  let dragging = false

  const rowHeight = () => {
    const screen = el.querySelector<HTMLElement>(".xterm-screen")
    return screen && term.rows ? screen.clientHeight / term.rows : 16
  }

  const scrollLines = (lines: number) => {
    if (!lines) return
    if (term.buffer.active.type === "alternate") {
      if (term.modes.mouseTrackingMode !== "none") return
      const prefix = term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b["
      send((prefix + (lines < 0 ? "A" : "B")).repeat(Math.min(Math.abs(lines), 8)))
    } else {
      term.scrollLines(lines)
    }
  }

  const feed = (px: number) => {
    acc += px
    const h = rowHeight()
    const lines = Math.trunc(acc / h)
    acc -= lines * h
    scrollLines(lines)
  }

  const glide = () => {
    velocity *= 0.95
    if (Math.abs(velocity) < 0.02) return
    feed(velocity * 16)
    raf = requestAnimationFrame(glide)
  }

  const onStart = (e: TouchEvent) => {
    cancelAnimationFrame(raf)
    if (e.touches.length !== 1) return void (dragging = false)
    dragging = true
    acc = 0
    velocity = 0
    lastY = e.touches[0].clientY
    lastT = e.timeStamp
  }

  const onMove = (e: TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return
    const y = e.touches[0].clientY
    const dy = lastY - y // finger up = read further down
    const dt = Math.max(1, e.timeStamp - lastT)
    velocity = 0.8 * (dy / dt) + 0.2 * velocity
    lastY = y
    lastT = e.timeStamp
    feed(dy)
    if (e.cancelable) e.preventDefault() // the page itself must not bounce or scroll
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (Math.abs(velocity) > 0.3) raf = requestAnimationFrame(glide)
  }

  el.addEventListener("touchstart", onStart, { passive: true })
  el.addEventListener("touchmove", onMove, { passive: false })
  el.addEventListener("touchend", onEnd)
  el.addEventListener("touchcancel", onEnd)
  return () => {
    cancelAnimationFrame(raf)
    el.removeEventListener("touchstart", onStart)
    el.removeEventListener("touchmove", onMove)
    el.removeEventListener("touchend", onEnd)
    el.removeEventListener("touchcancel", onEnd)
  }
}
