import React, { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[PreviewV]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const e = this.state.error
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            background: '#18181b',
            color: '#f4f4f5',
            minHeight: '100vh',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>PreviewV — UI error</h1>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              color: '#fca5a5',
              background: '#09090b',
              padding: 12,
              borderRadius: 8,
            }}
          >
            {e.message}
            {'\n\n'}
            {e.stack}
          </pre>
          <p style={{ marginTop: 16, fontSize: 12, color: '#a1a1aa' }}>
            Restart the app. In dev, check the console (F12) and the terminal.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
