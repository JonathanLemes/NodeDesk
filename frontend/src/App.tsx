import { useQueryClient } from "@tanstack/react-query"
import { Fragment, lazy, Suspense, useEffect } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/useIsMobile"
import { LoginScreen } from "@/desktop/LoginScreen"
import { useLanguage } from "@/hooks/useLanguage"
import { useTheme } from "@/hooks/useTheme"
import { t, useLang } from "@/i18n"
import { onUnauthorized } from "@/services/api"
import { keys, useAuth } from "@/services/queries"
import { installShortcuts } from "@/services/shortcuts"

const Desktop = lazy(() => import("@/desktop/Desktop").then((m) => ({ default: m.Desktop })))
const MobileShell = lazy(() => import("@/mobile/MobileShell").then((m) => ({ default: m.MobileShell })))

export function App() {
  const mobile = useIsMobile()
  useTheme()
  useLanguage()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()
  const { data: auth, isError } = useAuth()

  // One keyboard listener for the whole desktop; bindings come from the shortcuts service.
  useEffect(() => installShortcuts(), [])

  useEffect(() => {
    onUnauthorized(() => qc.invalidateQueries({ queryKey: keys.auth }))
  }, [qc])

  let view = <div className="fixed inset-0 bg-slate-800" />
  if (isError) {
    view = <div className="fixed inset-0 grid place-items-center bg-slate-900 text-sm text-white/70">{t("app.unreachable")}</div>
  } else if (auth) {
    view = auth.authenticated ? (
      <Suspense fallback={<div className="fixed inset-0 bg-slate-800" />}>
        {mobile ? <MobileShell /> : <Desktop onLock={() => qc.invalidateQueries({ queryKey: keys.auth })} />}
      </Suspense>
    ) : <LoginScreen status={auth} />
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* Strings are resolved at render time, so a language change remounts the UI. */}
      <Fragment key={lang}>{view}</Fragment>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

export default App
