import type { Atom, Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import type {
  CleanupFn,
  EffectFn,
  InternalState,
  PromiseOrValue,
  WriteFn,
} from './types'
import { defer, toggle } from './utils'

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const internalStateAtom = makeInternalStateAtom()
  return makeAtomEffect(effectFn, internalStateAtom)
}

export function makeAtomEffect(
  effectFn: EffectFn,
  internalStateAtom: WritableAtom<
    InternalState | null,
    [boolean | InternalState | null],
    void
  >
) {
  /**
   * returns true if this is the first run.
   */
  const isFirstRun = (get: Getter) =>
    get(internalStateAtom)?.dependencyMap.size === 0

  /**
   * returns true if dependency values have changed.
   */
  const hasChanged = (get: Getter) => {
    const dependencyMap = get(internalStateAtom)?.dependencyMap
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
    const dependencyMap = get(internalStateAtom)?.dependencyMap
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
        const dependencyMap = get(internalStateAtom)?.dependencyMap
        dependencyMap?.set(anAtom, value)
      }
      return value
    }

  /**
   * intercepts `set` and adds dependencies to Jotai's internal dependency maps.
   * inProgress is used to prevent infinite loops when the effectFn updates the atom it is watching.
   */
  const makeSetter =
    (set: Setter, getInternalState: () => InternalState | null) =>
    <Value, Args extends unknown[], Result>(
      anAtom: WritableAtom<Value, Args, Result>,
      ...args: Args
    ): Result => {
      const internalState = getInternalState()
      if (internalState) internalState.inProgress++
      const result = set(anAtom, ...args)
      if (internalState) internalState.inProgress--
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

  const baseAtom = atom<void, [WriteFn], PromiseOrValue<void>>(
    async (get, { setSelf }) => {
      const internalState = get(internalStateAtom)
      ensureWatchDependencies(get) // ensure all watched atoms are captured by Jotai's internal dependency map
      if (!internalState) return
      if (internalState.inProgress) return // effect setter has triggered this run
      if (!isFirstRun(get) && !hasChanged(get)) return // no changes
      internalState?.dependencyMap.clear()
      const shouldCollectDeps = { value: true }
      const getter = makeGetter(get, shouldCollectDeps)
      getter(rerunAtom)
      await defer() // defer effectFn to allow other atoms to update synchronously first
      setSelf(async (_, set) => {
        const setter = makeSetter(set, () => get(internalStateAtom))
        await internalState.cleanup?.()
        internalState.cleanup = await effectFn(getter, setter)
        shouldCollectDeps.value = false
        rerunToEvaluate(setter) // rerun to ensure all dependencies are captured
      })
    },
    (get, set, writeFn) => writeFn(get, set)
  )

  if (process.env.NODE_ENV !== 'production') {
    baseAtom.debugPrivate = true
  }

  const effectAtom = atom((get) => {
    get(baseAtom)
  })
  return effectAtom
}

export function makeInternalStateAtom(
  internalStateFactory: () => InternalState = createInternalState
) {
  const internalStateAtom = atom<
    InternalState | null,
    [boolean | InternalState | null],
    void
  >(null, (get, set, isInit) => {
    if (isInit) {
      set(internalStateAtom, internalStateFactory())
    } else {
      const internalState = get(internalStateAtom)
      internalState?.cleanup?.()
      set(internalStateAtom, null)
    }
  })
  internalStateAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }
  if (process.env.NODE_ENV !== 'production') {
    internalStateAtom.debugLabel = 'internalStateAtom'
    internalStateAtom.debugPrivate = true
  }
  return internalStateAtom
}

export function createInternalState(): InternalState {
  return {
    inProgress: 0,
    cleanup: undefined,
    dependencyMap: new Map<Atom<unknown>, unknown>(),
  }
}
