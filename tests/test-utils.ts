import { Component, type ErrorInfo, type ReactNode, createElement } from 'react'
import { createStore } from 'jotai/vanilla'
import {
  INTERNAL_buildStoreRev1 as INTERNAL_buildStore,
  INTERNAL_getBuildingBlocksRev1 as INTERNAL_getBuildingBlocks,
} from 'jotai/vanilla/internals'

//
// Debug Store
//

type Store = ReturnType<typeof INTERNAL_buildStore>

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<Parameters<typeof INTERNAL_buildStore>>

type DebugStore = Store & {
  ensureAtomState: NonNullable<BuildingBlocks[11]>
  name: string
}

let storeId = 0
export function createDebugStore(): DebugStore {
  const buildingBlocks = INTERNAL_getBuildingBlocks(
    createStore()
  ) as unknown as BuildingBlocks
  const ensureAtomState = buildingBlocks[11]!
  buildingBlocks[11] = (atom) =>
    Object.assign(ensureAtomState(atom), { label: atom.debugLabel })
  const debugStore = INTERNAL_buildStore(...buildingBlocks) as DebugStore
  const name = `debug${storeId++}`
  Object.assign(debugStore, { ensureAtomState, name })
  return debugStore
}

//
// Error Boundary
//

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

//
// Deferred
//

export type DeferredPromise<T = void> = Promise<T> & {
  resolve: (value: T) => void
  reject: (reason?: any) => void
}

export function createDeferred<T = void>(
  ...[onfulfilled, onrejected]: Parameters<Promise<T>['then']>
): DeferredPromise<T> {
  const resolveReject = {} as DeferredPromise<T>
  const promise = new Promise<T>((res, rej) =>
    Object.assign(resolveReject, {
      resolve: (value: T) => res(value) ?? promise,
      reject: (message: any) => rej(message) ?? promise,
    })
  ).then(onfulfilled, onrejected) as DeferredPromise<T>
  return Object.assign(promise, resolveReject)
}
