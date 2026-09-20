import { useEffect } from "react"

import { resolveLang, useLang } from "@/i18n"
import { useSettings } from "@/services/queries"

/**
 * Applies the language setting ("auto" follows the browser). Before the settings load, the
 * language cached in localStorage / detected from the browser is already in effect.
 */
export function useLanguage() {
  const { data } = useSettings()
  const setLang = useLang((s) => s.setLang)
  const setting = data?.language
  useEffect(() => {
    if (setting !== undefined) setLang(resolveLang(setting))
  }, [setting, setLang])
}
