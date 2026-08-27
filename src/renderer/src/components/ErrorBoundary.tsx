import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label so nested boundaries (e.g. per-tab) can say what crashed. */
  label?: string
  /** Called when a child throws, before rendering the fallback. */
  onReset?: () => void
}

interface State {
  error: Error | null
}

/**
 * Catches render-time exceptions in its subtree so one bad row/cell/table can't
 * unmount the entire app (React's default behavior with no boundary is to blank
 * the whole tree — that's what caused the all-white window).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info.componentStack)
  }

  private handleReset = (): void => {
    this.props.onReset?.()
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 24, color: 'var(--text)', overflow: 'auto', flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          {this.props.label ? `Something went wrong rendering "${this.props.label}"` : 'Something went wrong'}
        </div>
        <div className="error-banner" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {error.message}
        </div>
        <button className="btn small" onClick={this.handleReset}>
          Try again
        </button>
      </div>
    )
  }
}
