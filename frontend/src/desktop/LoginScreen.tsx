import { useQueryClient } from "@tanstack/react-query"
import { ArrowRight, Loader2 } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Logo } from "@/components/Logo"
import { Input } from "@/components/ui/input"
import { Wallpaper } from "@/desktop/wallpapers"
import { api } from "@/services/api"
import { errorMessage, keys, useSettings } from "@/services/queries"
import type { AuthStatus } from "@/types/api"

export function LoginScreen({ status }: { status: AuthStatus }) {
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const setup = status.setupRequired

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      if (setup) await api.post("/api/auth/setup", { token: code.trim(), password })
      await api.post("/api/auth/login", { username: status.user, password })
      await qc.invalidateQueries({ queryKey: keys.auth })
      qc.invalidateQueries()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0">
      <Wallpaper value={settings?.wallpaper ?? "builtin:alpine"} />
      <div className="absolute inset-0 bg-black/20 backdrop-blur-2xl" />
      <form onSubmit={submit} className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white animate-[fade-in_0.3s]">
        <div className="mb-1 grid size-24 place-items-center rounded-full bg-white/20 shadow-lg ring-1 ring-white/30 backdrop-blur-xl">
          <Logo size={46} />
        </div>
        <h1 className="text-xl font-semibold drop-shadow">{setup ? "Set up NodeDesk" : "NodeDesk"}</h1>
        {setup && <p className="max-w-xs text-center text-[13px] text-white/80">Enter the one-time setup code printed in the server log, then choose an admin password.</p>}
        {setup && (
          <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Setup code" autoComplete="off"
            className="h-9 w-64 rounded-full border-white/30 bg-white/20 px-4 text-white placeholder:text-white/60" />
        )}
        <div className="relative">
          <Input
            autoFocus={!setup}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={setup ? "New password (8+ characters)" : "Password"}
            autoComplete={setup ? "new-password" : "current-password"}
            className="h-9 w-64 rounded-full border-white/30 bg-white/20 pr-10 pl-4 text-white placeholder:text-white/60"
          />
          <button type="submit" disabled={busy || !password} aria-label="Sign in" className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/25 hover:bg-white/40 disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          </button>
        </div>
        <p className="h-4 text-[13px] text-red-100 drop-shadow" role="alert">{error}</p>
      </form>
    </div>
  )
}
