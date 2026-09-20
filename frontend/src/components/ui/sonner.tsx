import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/hooks/useTheme"

const Toaster = (props: ToasterProps) => {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      style={{ zIndex: 10001 }}
      toastOptions={{ classNames: { toast: "!rounded-xl !border-border !bg-popover/90 !backdrop-blur-xl !text-popover-foreground !shadow-lg" } }}
      {...props}
    />
  )
}

export { Toaster }
