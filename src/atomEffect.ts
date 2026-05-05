import type { Atom, Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_MountedMap as MountedMap,
  INTERNAL_StoreHooks as StoreHooks,
  INTERNAL_buildStoreRev3 as buildStore,
} from 'jotai/vanilla/internals'
import {
  INTERNAL_getBuildingBlocksRev3 as getBuildingBlocks,
  INTERNAL_hasInitialValue as hasInitialValue,
  INTERNAL_initializeStoreHooksRev3 as initializeStoreHooks,
  INTERNAL_isAtomStateInitialized as isAtomStateInitialized,
  INTERNAL_returnAtomValue as returnAtomValue,
} from 'jotai/vanilla/internals'
import { isDev } from './env'

type Store = ReturnType<typeof buildStore>

type AnyAtom = Atom<unknown>

export type GetterWithPeek = Getter & { peek: Getter }

export type SetterWithRecurse = Setter & { recurse: Setter }

type Cleanup = () => void

export type Effect = (
  get: GetterWithPeek,
  set: SetterWithRecurse
) => void | Cleanup

type Ref = [
  dependencies: Set<AnyAtom>,
  atomState: AtomState<void>,
  mountedMap: MountedMap,
]

export function atomEffect(effect: Effect): Atom<void> & { effect: Effect } {
  const refAtom = atom<Partial<Ref>>(() => [])

  const effectAtom = atom(function effectAtomRead(get) {
    const [dependencies, atomState, mountedMap] = get(refAtom)
    if (mountedMap!.has(effectAtom)) {
      dependencies!.forEach(get)
      ++atomState!.n
    }
  }) as Atom<void> & { effect: Effect }

  effectAtom.effect = effect

  effectAtom.INTERNAL_onInit = (store) => {
    const buildingBlocks = getBuildingBlocks(store)
    const mountedMap = buildingBlocks[1]
    const changedAtoms = buildingBlocks[3]
    const storeHooks = initializeStoreHooks(buildingBlocks[6])
    const ensureAtomState = buildingBlocks[11]
    const flushCallbacks = buildingBlocks[12]
    const recomputeInvalidatedAtoms = buildingBlocks[13]
    const readAtomState = buildingBlocks[14]
    const invalidateDependents = buildingBlocks[15]
    const writeAtomState = buildingBlocks[16]
    const mountDependencies = buildingBlocks[17]
    const setAtomStateValueOrPromise = buildingBlocks[20]

    const deps = new Set<AnyAtom>()
    let inProgress = 0
    let isRecursing = false
    let hasChanged = false
    let fromCleanup = false
    let runCleanup: (() => void) | undefined

    function runEffect() {
      if (inProgress) {
        return
      }
      deps.clear()
      let isSync = true

      const getter: GetterWithPeek = (a) => {
        if (fromCleanup) {
          return store.get(a)
        }
        if (a === (effectAtom as AnyAtom)) {
          const aState = ensureAtomState(buildingBlocks, store, a)
          if (!isAtomStateInitialized(aState)) {
            if (hasInitialValue(a)) {
              setAtomStateValueOrPromise(buildingBlocks, store, a, a.init)
            } else {
              // NOTE invalid derived atoms can reach here
              throw new Error('no atom init')
            }
          }
          return returnAtomValue(aState)
        }
        // a !== atom
        const aState = readAtomState(buildingBlocks, store, a)
        try {
          return returnAtomValue(aState)
        } finally {
          atomState.d.set(a, aState.n)
          mountedMap.get(a)?.t.add(effectAtom)
          if (isSync) {
            deps.add(a)
          } else {
            if (mountedMap.has(a)) {
              mountDependencies(buildingBlocks, store, effectAtom)
              recomputeInvalidatedAtoms(buildingBlocks, store)
              flushCallbacks(buildingBlocks, store)
            }
          }
        }
      }

      getter.peek = store.get

      const setter: SetterWithRecurse = <V, As extends unknown[], R>(
        a: WritableAtom<V, As, R>,
        ...args: As
      ) => {
        const aState = ensureAtomState(buildingBlocks, store, a)
        try {
          ++inProgress
          if (a === (effectAtom as AnyAtom)) {
            if (!hasInitialValue(a)) {
              // NOTE technically possible but restricted as it may cause bugs
              throw new Error('atom not writable')
            }
            const prevEpochNumber = aState.n
            const v = args[0] as V
            setAtomStateValueOrPromise(buildingBlocks, store, a, v)
            mountDependencies(buildingBlocks, store, a)
            if (prevEpochNumber !== aState.n) {
              changedAtoms.add(a)
              storeHooks.c?.(a)
              invalidateDependents(buildingBlocks, store, a)
            }
            return undefined as R
          } else {
            return writeAtomState(buildingBlocks, store, a, args)
          }
        } finally {
          if (!isSync) {
            recomputeInvalidatedAtoms(buildingBlocks, store)
            flushCallbacks(buildingBlocks, store)
          }
          --inProgress
        }
      }

      setter.recurse = (a, ...args) => {
        if (fromCleanup) {
          if (isDev()) {
            throw new Error('set.recurse is not allowed in cleanup')
          }
          return undefined as any
        }
        try {
          isRecursing = true
          mountDependencies(buildingBlocks, store, effectAtom)
          return setter(a, ...args)
        } finally {
          recomputeInvalidatedAtoms(buildingBlocks, store)
          isRecursing = false
          if (hasChanged) {
            hasChanged = false
            runEffect()
          }
        }
      }

      try {
        runCleanup?.()
        const cleanup = effectAtom.effect(getter, setter)
        if (typeof cleanup !== 'function') {
          return
        }
        runCleanup = () => {
          if (inProgress) {
            return
          }
          try {
            isSync = true
            fromCleanup = true
            return cleanup()
          } finally {
            isSync = false
            fromCleanup = false
            runCleanup = undefined
          }
        }
      } finally {
        isSync = false
        deps.forEach((depAtom) => {
          atomState.d.set(
            depAtom,
            ensureAtomState(buildingBlocks, store, depAtom).n
          )
        })
        mountDependencies(buildingBlocks, store, effectAtom)
        recomputeInvalidatedAtoms(buildingBlocks, store)
      }
    }

    const atomEffectChannel = ensureAtomEffectChannel(store, storeHooks)
    const atomState = ensureAtomState(buildingBlocks, store, effectAtom)
    // initialize atomState
    atomState.v = undefined

    Object.assign(store.get(refAtom), [deps, atomState, mountedMap])

    storeHooks.c.add(effectAtom, function atomOnChange() {
      ;(changedAtoms as Set<AnyAtom>).delete(effectAtom)
    })

    storeHooks.m.add(effectAtom, function atomOnMount() {
      // mounted
      atomEffectChannel.add(runEffect)
      if (runCleanup) {
        atomEffectChannel.delete(runCleanup)
      }
    })

    storeHooks.u.add(effectAtom, function atomOnUnmount() {
      // unmounted
      atomEffectChannel.delete(runEffect)
      if (runCleanup) {
        atomEffectChannel.add(runCleanup)
      }
    })

    storeHooks.c.add(effectAtom, function atomOnUpdate() {
      // changed
      if (isRecursing) {
        hasChanged = true
      } else {
        atomEffectChannel.add(runEffect)
      }
    })
  }

  if (isDev()) {
    Object.defineProperty(refAtom, 'debugLabel', {
      get: () =>
        effectAtom.debugLabel ? `${effectAtom.debugLabel}:ref` : undefined,
      configurable: true,
      enumerable: true,
    })
    refAtom.debugPrivate = true
  }

  return effectAtom
}

type AtomEffectChannel = Set<() => void>
const atomEffectChannelStoreMap = new WeakMap<Store, AtomEffectChannel>()

function ensureAtomEffectChannel(
  store: Store,
  storeHooks: Required<StoreHooks>
): AtomEffectChannel {
  let atomEffectChannel = atomEffectChannelStoreMap.get(store)
  if (!atomEffectChannel) {
    atomEffectChannel = new Set()
    atomEffectChannelStoreMap.set(store, atomEffectChannel)
    storeHooks.f.add(function storeOnFlush() {
      // flush
      for (const fn of atomEffectChannel!) {
        atomEffectChannel!.delete(fn)
        fn()
      }
    })
  }
  return atomEffectChannel
}
