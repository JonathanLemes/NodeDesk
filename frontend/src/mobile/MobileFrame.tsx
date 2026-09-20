import { ChevronLeft } from "lucide-react"
import { Suspense, useState } from "react"

import { getDesktopApp } from "@/apps/registry"
import { Button } from "@/components/ui/button"
import { t } from "@/i18n"
import type { DesktopWindow } from "@/stores/windows"
import { WindowContext } from "@/windows/context"
import { ErrorBoundary } from "@/windows/ErrorBoundary"

/** A window on a phone: a full-screen page with a back button; the app's toolbar sits in the header. */
export function MobileFrame({ win, top, onBack }: { win: DesktopWindow; top: boolean; onBack: () => void }) {
  const app = getDesktopApp(win.appId)
  const [titlebar, setTitlebar] = useState<HTMLElement | null>(null)
  if (!app) return null
  const Content = app.component

  return (
    <WindowContext.Provider value={{ windowId: win.id, titlebar, focused: top }}>
      <div
        data-focused={top}
        className="fixed inset-0 flex animate-[slide-up_0.26s_cubic-bezier(.2,.8,.2,1)] flex-col bg-window text-foreground"
        style={{ zIndex: win.z }}
      >
        <header
          className="relative flex shrink-0 items-center gap-1 border-b border-border/70 bg-window px-2 pb-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
        >
          <Button variant="ghost" size="icon" aria-label={t("mobile.home")} onClick={onBack}><ChevronLeft className="size-6" /></Button>
          <div ref={setTitlebar} className="peer flex h-9 min-w-0 flex-1 items-center gap-1.5" />
          <span className="pointer-events-none absolute inset-x-14 bottom-4 hidden truncate text-center text-[15px] font-semibold peer-empty:block">
            {win.title ?? app.title}
          </span>
        </header>
        <div className="relative min-h-0 flex-1" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <ErrorBoundary>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>}>
              <Content windowId={win.id} props={win.props} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </WindowContext.Provider>
  )
}
