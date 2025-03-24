import { Component, type ErrorInfo, type ReactNode, createElement } from 'react'
import {
  INTERNAL_buildStoreRev1 as INTERNAL_buildStore,
  INTERNAL_getBuildingBlocksRev1 as INTERNAL_getBuildingBlocks,
} from 'jotai/vanilla/internals'

//
// Debug Store
//

type Store = ReturnType<typeof INTERNAL_buildStore>

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<ReturnType<typeof INTERNAL_getBuildingBlocks>>

type DebugStore = Store & {
  name: string
  state: {
    atomStateMap: BuildingBlocks[0]
    mountedMap: BuildingBlocks[1]
    invalidatedAtoms: BuildingBlocks[2]
    changedAtoms: BuildingBlocks[3]
    mountCallbacks: BuildingBlocks[4]
    unmountCallbacks: BuildingBlocks[5]
    storeHooks: BuildingBlocks[6]
  }
}

let storeId = 0
export function createDebugStore(
  name: string = `debug${storeId++}`
): DebugStore {
  const foundation = INTERNAL_getBuildingBlocks(
    INTERNAL_buildStore()
  ) as BuildingBlocks
  const buildingBlocks = foundation.slice(0, 7) as Partial<BuildingBlocks>
  const ensureAtomState = foundation[11]!
  buildingBlocks[11] = (atom) =>
    Object.assign(ensureAtomState(atom), { label: atom.debugLabel })
  const debugStore = INTERNAL_buildStore(...buildingBlocks) as DebugStore
  debugStore.name = name
  debugStore.state = {
    atomStateMap: buildingBlocks[0]!,
    mountedMap: buildingBlocks[1]!,
    invalidatedAtoms: buildingBlocks[2]!,
    changedAtoms: buildingBlocks[3]!,
    mountCallbacks: buildingBlocks[4]!,
    unmountCallbacks: buildingBlocks[5]!,
    storeHooks: buildingBlocks[6]!,
  }
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
  ).then(onfulfilled, onrejected)
  return Object.assign(promise, resolveReject)
}
