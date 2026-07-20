import type {
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_Callbacks as Callbacks,
  INTERNAL_ChangedAtoms as ChangedAtoms,
  INTERNAL_BuildingBlocks,
  INTERNAL_InvalidatedAtoms as InvalidatedAtoms,
  INTERNAL_MountedMap as MountedMap,
  INTERNAL_Store as Store,
  INTERNAL_StoreHooks as StoreHooks,
} from '../src/jotai-compat'
import {
  INTERNAL_KEY_atomStateMap,
  INTERNAL_KEY_changedAtoms,
  INTERNAL_KEY_ensureAtomState,
  INTERNAL_KEY_invalidatedAtoms,
  INTERNAL_KEY_mountCallbacks,
  INTERNAL_KEY_mountedMap,
  INTERNAL_KEY_storeHooks,
  INTERNAL_KEY_unmountCallbacks,
  INTERNAL_buildStore as buildStore,
  INTERNAL_getBuildingBlocks as getBuildingBlocks,
  INTERNAL_initializeStoreHooks as initializeStoreHooks,
} from '../src/jotai-compat'

//
// Debug Store
//

type DebugStore = Store & {
  name: string
  state: {
    atomStateMap: AtomStateMap
    mountedMap: MountedMap
    invalidatedAtoms: InvalidatedAtoms
    changedAtoms: ChangedAtoms
    mountCallbacks: Callbacks
    unmountCallbacks: Callbacks
    storeHooks: Required<StoreHooks>
  }
}

let storeId = 0
export function createDebugStore(
  name: string = `debug${storeId++}`
): DebugStore {
  const raw = getBuildingBlocks(buildStore())
  const buildingBlocks = (
    Array.isArray(raw)
      ? [...(raw as unknown[])]
      : { ...(raw as Record<string, unknown>) }
  ) as INTERNAL_BuildingBlocks
  const ensureAtomState = buildingBlocks[INTERNAL_KEY_ensureAtomState]
  buildingBlocks[INTERNAL_KEY_ensureAtomState] = (bb, store, atom) =>
    Object.assign(ensureAtomState(bb, store, atom), { label: atom.debugLabel })
  const debugStore = buildStore(buildingBlocks) as DebugStore
  debugStore.name = name
  debugStore.state = {
    atomStateMap: buildingBlocks[INTERNAL_KEY_atomStateMap],
    mountedMap: buildingBlocks[INTERNAL_KEY_mountedMap],
    invalidatedAtoms: buildingBlocks[INTERNAL_KEY_invalidatedAtoms],
    changedAtoms: buildingBlocks[INTERNAL_KEY_changedAtoms],
    mountCallbacks: buildingBlocks[INTERNAL_KEY_mountCallbacks],
    unmountCallbacks: buildingBlocks[INTERNAL_KEY_unmountCallbacks],
    storeHooks: initializeStoreHooks(buildingBlocks[INTERNAL_KEY_storeHooks]),
  }
  return debugStore
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
