/** Copies text; falls back to execCommand where the async clipboard needs HTTPS (plain-http LAN installs). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea")
  ta.value = text
  ta.setAttribute("readonly", "")
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"
  document.body.appendChild(ta)
  ta.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    ta.remove()
  }
}

/** Reads the clipboard, or null when the browser will not allow it (needs HTTPS and a permission). */
export async function readText(): Promise<string | null> {
  try {
    return (await navigator.clipboard?.readText()) ?? null
  } catch {
    return null
  }
}
