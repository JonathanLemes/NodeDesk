import { Logo } from "@/components/Logo"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatBytes, formatDuration } from "@/lib/format"
import { useAuth, useSystemInfo } from "@/services/queries"

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: info } = useSystemInfo()
  const { data: auth } = useAuth()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          <div className="mb-1 grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground"><Logo size={34} /></div>
          <DialogTitle className="text-lg">NodeDesk</DialogTitle>
          <DialogDescription>Version {auth?.version ?? "dev"} · Open Source · MIT</DialogDescription>
        </DialogHeader>
        {info && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-xs">
            <dt className="text-muted-foreground">Host</dt><dd>{info.hostname}</dd>
            <dt className="text-muted-foreground">System</dt><dd>{info.os} · {info.kernel}</dd>
            <dt className="text-muted-foreground">CPU</dt><dd className="truncate">{info.cpuModel} ({info.cores} threads)</dd>
            <dt className="text-muted-foreground">Memory</dt><dd>{formatBytes(info.memTotal)}</dd>
            {info.gpus.length > 0 && (<><dt className="text-muted-foreground">GPU</dt><dd>{info.gpus.join(", ")}</dd></>)}
            <dt className="text-muted-foreground">Uptime</dt><dd>{formatDuration(info.uptime)}</dd>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
