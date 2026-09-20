import { Component, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">This app ran into a problem.</p>
        <p className="max-w-sm text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button size="sm" variant="secondary" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    )
  }
}
