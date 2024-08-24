import { Component, type ErrorInfo, type ReactNode, createElement } from 'react'

export function increment(count: number) {
  return count + 1
}

export function incrementLetter(str: string) {
  return String.fromCharCode(increment(str.charCodeAt(0)))
}

export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function assert(value: boolean, message?: string): asserts value {
  if (!value) {
    throw new Error(message ?? 'assertion failed')
  }
}

type ErrorBoundaryState = {
  hasError: boolean
}
type ErrorBoundaryProps = {
  componentDidCatch?: (error: Error, errorInfo: ErrorInfo) => void
  children: ReactNode
}
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo): void {
    this.props.componentDidCatch?.(error, _errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return createElement('div', { children: 'error' })
    }
    return this.props.children
  }
}
