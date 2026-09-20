import { Plus, RotateCcw, X } from "lucide-react"
import { useEffect, useState } from "react"

import { getDesktopApp } from "@/apps/registry"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { t } from "@/i18n"
import {
  bindingOf, bindingsOf, canonical, conflictsFor, defaultBindings, formatBinding, isCustomised, isSafeGlobal,
  SHORTCUTS, useShortcutSettings, type ShortcutDef,
} from "@/services/shortcuts"

const scopeTitle = (scope: string) => (scope === "global" ? t("shortcuts.global") : (getDesktopApp(scope)?.title ?? scope))

/** Records the next key combination pressed. Esc cancels. */
function Recorder({ onCapture, onCancel }: { onCapture: (binding: string) => void; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") return onCancel()
      const b = bindingOf(e)
      if (b) onCapture(b) // bare modifiers (Shift, Ctrl…) return null and keep listening
    }
    // Capture phase and before the dispatcher, so recording a key never triggers its old action.
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onCapture, onCancel])
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-md border border-primary bg-primary/10 px-2.5 text-[12.5px] text-primary">
      {t("shortcuts.press")} <span className="text-muted-foreground">{t("shortcuts.cancel_hint")}</span>
    </span>
  )
}

function Keys({ children }: { children: string }) {
  return <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-muted px-2 font-sans text-[12.5px] font-medium">{children}</kbd>
}

function Row({ def }: { def: ShortcutDef }) {
  const { saved, set, reset } = useShortcutSettings()
  // index being recorded (== length means "add another")
  const [recording, setRecording] = useState<number | null>(null)
  const [pending, setPending] = useState<{ index: number; binding: string; owner: ShortcutDef } | null>(null)
  const [warn, setWarn] = useState<string | null>(null)

  const current = bindingsOf(def.id, saved)
  const custom = isCustomised(def.id, saved)

  const apply = (index: number, binding: string, replace?: ShortcutDef) => {
    const next = [...current]
    next[index] = binding
    set(def.id, [...new Set(next.filter(Boolean))].slice(0, 4))
    if (replace) set(replace.id, bindingsOf(replace.id, saved).filter((b) => canonical(b) !== canonical(binding)))
    setRecording(null)
    setPending(null)
    setWarn(null)
  }

  const capture = (index: number) => (binding: string) => {
    if (def.scope === "global" && !isSafeGlobal(binding)) {
      setWarn(t("shortcuts.needs_modifier"))
      return
    }
    const [owner] = conflictsFor(def.id, binding, canonical, saved)
    if (owner) {
      setRecording(null)
      setPending({ index, binding, owner })
    } else apply(index, binding)
  }

  return (
    <div className="border-b border-border/60 py-2.5 first:pt-0 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-44 text-[13.5px]">
          {def.label}
          {custom && <span className="ml-2 text-[11px] text-primary">{t("shortcuts.custom")}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {def.fixed ? (
            <>{current.map((b) => <Keys key={b}>{formatBinding(b)}</Keys>)}<span className="text-xs text-muted-foreground">{t("shortcuts.fixed")}</span></>
          ) : (
            <>
              {current.map((b, i) =>
                recording === i ? (
                  <Recorder key={b} onCapture={capture(i)} onCancel={() => { setRecording(null); setWarn(null) }} />
                ) : (
                  <span key={b} className="group inline-flex items-center">
                    <button onClick={() => { setPending(null); setWarn(null); setRecording(i) }} title={t("common.edit")}><Keys>{formatBinding(b)}</Keys></button>
                    <button
                      aria-label={t("shortcuts.remove")}
                      onClick={() => set(def.id, current.filter((_, j) => j !== i))}
                      className="ml-0.5 grid size-5 place-items-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-foreground/10 focus-visible:opacity-100"
                    ><X className="size-3" /></button>
                  </span>
                ),
              )}
              {current.length === 0 && recording === null && <button onClick={() => setRecording(0)} className="text-[12.5px] text-muted-foreground hover:text-foreground">{t("shortcuts.unbound")}</button>}
              {recording === current.length && <Recorder onCapture={capture(current.length)} onCancel={() => { setRecording(null); setWarn(null) }} />}
              {current.length > 0 && current.length < 4 && recording === null && (
                <Button size="icon-xs" variant="ghost" aria-label={t("shortcuts.add")} title={t("shortcuts.add")} onClick={() => { setPending(null); setRecording(current.length) }}><Plus /></Button>
              )}
              {custom && <Button size="icon-xs" variant="ghost" aria-label={t("shortcuts.reset")} title={t("shortcuts.reset")} onClick={() => reset(def.id)}><RotateCcw /></Button>}
            </>
          )}
        </div>
      </div>
      {warn && <p className="mt-1.5 text-xs text-destructive">{warn}</p>}
      {pending && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[12.5px]">
          <span className="flex-1">{t("shortcuts.conflict", { name: pending.owner.label, keys: formatBinding(pending.binding) })}</span>
          <Button size="xs" onClick={() => apply(pending.index, pending.binding, pending.owner)}>{t("shortcuts.replace")}</Button>
          <Button size="xs" variant="ghost" onClick={() => setPending(null)}>{t("common.cancel")}</Button>
        </div>
      )}
    </div>
  )
}

/** Settings → Shortcuts (desktop web): every shortcut in the catalogue, grouped by where it works. */
export function ShortcutsSettings() {
  const { saved, resetAll } = useShortcutSettings()
  const scopes = [...new Set(SHORTCUTS.map((s) => s.scope))].sort((a, b) => (a === "global" ? -1 : b === "global" ? 1 : scopeTitle(a).localeCompare(scopeTitle(b))))
  const changed = SHORTCUTS.some((s) => isCustomised(s.id, saved) && JSON.stringify(saved[s.id]) !== JSON.stringify(defaultBindings(s)))
  return (
    <>
      <p className="mb-4 text-[13px] text-muted-foreground">{t("shortcuts.intro")}</p>
      {scopes.map((scope) => (
        <section key={scope} className="mb-7">
          <h3 className="mb-2 text-[13px] font-semibold">{scopeTitle(scope)}</h3>
          <div className={cn("rounded-xl border border-border/70 p-4")}>
            {SHORTCUTS.filter((s) => s.scope === scope).map((def) => <Row key={def.id} def={def} />)}
          </div>
          {scope === "terminal" && <p className="mt-2 text-xs text-muted-foreground">{t("shortcuts.terminal_note")}</p>}
        </section>
      ))}
      <Button size="sm" variant="secondary" disabled={!Object.keys(saved).length && !changed} onClick={resetAll}>{t("shortcuts.reset_all")}</Button>
    </>
  )
}
