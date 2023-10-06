import type { Atom, Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import { defer, toggle } from './utils'

type CleanupFn = () => PromiseOrValue<void>
type PromiseOrValue<T> = Promise<T> | T

// internal state now exists for the lifetime of the atomEffect
export type InternalState = {
  // defines whether the effect is mounted, was previously internalState === null
  mounted: boolean
  inProgress: number
  cleanup: CleanupFn | void
  dependencyMap: Map<Atom<unknown>, unknown>
}

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const refAtom = atom<InternalState>({
    mounted: false,
    inProgress: 0,
    cleanup: undefined,
    dependencyMap: new Map<Atom<unknown>, unknown>(),
  })
  const initAtom = atom(null, (get, _set, mounted: boolean) => {
    const ref = get(refAtom)
    if (mounted) {
      ref.mounted = true
    } else {
      ref.cleanup?.() // do not await
      ref.mounted = false
      ref.dependencyMap.clear() // we should clear the dependencyMap on unmount
      ref.cleanup = undefined
    }
  })
  initAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }

  /**
   * returns true if this is the first run.
   */
  const isFirstRun = (get: Getter) => get(refAtom)?.dependencyMap.size === 0

  /**
   * returns true if dependency values have changed.
   */
  const hasChanged = (get: Getter) => {
    const dependencyMap = get(refAtom)?.dependencyMap
    const atoms = Array.from(dependencyMap?.keys() ?? []).filter(
      (anAtom) => anAtom !== rerunAtom
    )
    return atoms.some((anAtom) => get(anAtom) !== dependencyMap?.get(anAtom))
  }

  /**
   * adds dependencies to Jotai's internal dependency maps.
   * this is needed because the effectFn is not run in the same run as the read function.
   */
  const ensureWatchDependencies = (get: Getter) => {
    const dependencyMap = get(refAtom)?.dependencyMap
    Array.from(dependencyMap?.keys() ?? []).forEach((anAtom) => {
      get(anAtom)
    })
  }

  /**
   * intercepts `get` and adds dependencies to Jotai's internal dependency maps
   */
  const makeGetter =
    (get: Getter, shouldCollectDeps: { value: boolean }) =>
    <Value>(anAtom: Atom<Value>): Value => {
      const value = get(anAtom)
      if (shouldCollectDeps.value) {
        const dependencyMap = get(refAtom)?.dependencyMap
        dependencyMap?.set(anAtom, value)
      }
      return value
    }

  /**
   * intercepts `set` and adds dependencies to Jotai's internal dependency maps.
   * inProgress is used to prevent infinite loops when the effectFn updates the atom it is watching.
   */
  const makeSetter =
    (set: Setter, getInternalState: () => InternalState) =>
    <Value, Args extends unknown[], Result>(
      anAtom: WritableAtom<Value, Args, Result>,
      ...args: Args
    ): Result => {
      const internalState = getInternalState()
      internalState.inProgress++
      const result = set(anAtom, ...args)
      internalState.inProgress--
      return result
    }

  /**
   * toggles a value to trigger a rerun.
   * this rerun is used to capture all missed atoms not watched by the previous run
   */
  const rerunToEvaluate = (set: Setter) => {
    set(rerunAtom, toggle)
  }

  const rerunAtom = atom(true)
  if (process.env.NODE_ENV !== 'production') {
    rerunAtom.debugLabel = 'rerunAtom'
    rerunAtom.debugPrivate = true
  }

  const effectAtom = atom(
    async (get, { setSelf }) => {
      const ref = get(refAtom)
      ensureWatchDependencies(get) // ensure all watched atoms are captured by Jotai's internal dependency map
      if (!ref.mounted) {
        return
      }
      if (ref.inProgress) {
        return
      }
      if (!isFirstRun(get) && !hasChanged(get)) return // no changes
      ref?.dependencyMap.clear()
      const shouldCollectDeps = { value: true }
      const getter = makeGetter(get, shouldCollectDeps)
      getter(rerunAtom)
      await defer() // defer effectFn to allow other atoms to update synchronously first
      const setter = makeSetter(setSelf as Setter, () => get(refAtom))
      await ref.cleanup?.()
      ref.cleanup = await effectFn(getter, setter)
      shouldCollectDeps.value = false
      rerunToEvaluate(setter) // rerun to ensure all dependencies are captured
    },
    (
      _get,
      set,
      a: WritableAtom<unknown, unknown[], unknown>,
      ...args: unknown[]
    ) => set(a, ...args)
  )

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}
