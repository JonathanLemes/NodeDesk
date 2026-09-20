import { useQueryClient } from "@tanstack/react-query"
import { Fragment, useEffect } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Desktop } from "@/desktop/LazyDesktop"
import { LoginScreen } from "@/desktop/LoginScreen"
import { useLanguage } from "@/hooks/useLanguage"
import { useTheme } from "@/hooks/useTheme"
import { t, useLang } from "@/i18n"
import { onUnauthorized } from "@/services/api"
import { keys, useAuth } from "@/services/queries"

export function App() {
  useTheme()
  useLanguage()
  const lang = useLang((s) => s.lang)
  const qc = useQueryClient()
  const { data: auth, isError } = useAuth()

  useEffect(() => {
    onUnauthorized(() => qc.invalidateQueries({ queryKey: keys.auth }))
  }, [qc])

  let view = <div className="fixed inset-0 bg-slate-800" />
  if (isError) {
    view = <div className="fixed inset-0 grid place-items-center bg-slate-900 text-sm text-white/70">{t("app.unreachable")}</div>
  } else if (auth) {
    view = auth.authenticated ? <Desktop onLock={() => qc.invalidateQueries({ queryKey: keys.auth })} /> : <LoginScreen status={auth} />
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
