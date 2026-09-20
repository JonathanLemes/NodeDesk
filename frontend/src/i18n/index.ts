import { create } from "zustand"

import { en, type Key } from "@/i18n/en"
import { pt } from "@/i18n/pt"

export type Lang = "en" | "pt"
/** What the user picks: a language, or follow the browser. */
export type LangSetting = "auto" | Lang

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: "en", name: "English" },
  { id: "pt", name: "Português" },
]

const dictionaries: Record<Lang, Record<Key, string>> = { en, pt }
const STORAGE_KEY = "nodedesk.lang"

/** "auto" resolves against the browser's preferred languages; English is the fallback. */
export function resolveLang(setting: LangSetting | undefined): Lang {
  if (setting === "en" || setting === "pt") return setting
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const p of prefs) {
    const base = p.toLowerCase().split("-")[0]
    if (base === "pt") return "pt"
    if (base === "en") return "en"
  }
  return "en"
}

function initial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === "en" || v === "pt") return v
  } catch {
    /* storage unavailable */
  }
  return resolveLang("auto")
}

interface LangStore {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useLang = create<LangStore>((set) => ({
  lang: initial(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang
    set({ lang })
  },
}))

type Params = Record<string, string | number>
/** Keys usable with a `count` param: `foo_one` / `foo_other` are addressed as `foo`. */
type PluralBase<K> = K extends `${infer B}_one` ? B : never
export type MessageKey = Key | PluralBase<Key>

/**
 * Translates a key in the current language. `{name}` placeholders are filled from params;
 * with a numeric `count`, the `_one` / `_other` variant is chosen by the language's plural rules.
 * Language changes remount the UI (see App), so this can be a plain function.
 */
export function t(key: MessageKey, params?: Params): string {
  const lang = useLang.getState().lang
  const dict = dictionaries[lang] as Record<string, string>
  let k: string = key
  if (params && typeof params.count === "number") {
    const form = new Intl.PluralRules(lang).select(params.count) === "one" ? "_one" : "_other"
    if (`${key}${form}` in dict) k = `${key}${form}`
  }
  const msg = dict[k] ?? (en as Record<string, string>)[k] ?? k
  return params ? msg.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : msg
}

/** BCP 47 tag for Intl formatting in the current language. */
export function locale(): string {
  return useLang.getState().lang === "pt" ? "pt-BR" : "en-US"
}

document.documentElement.lang = useLang.getState().lang
