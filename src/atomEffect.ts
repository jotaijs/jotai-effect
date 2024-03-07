import type { Atom, Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type CleanupFn = () => void
type GetterWithPeek = Getter & { peek: Getter }
type SetterWithRecurse = Setter & { recurse: Setter }

export function atomEffect(
  effectFn: (get: GetterWithPeek, set: SetterWithRecurse) => void | CleanupFn
) {
  const refAtom = atom(() => ({
    mounted: false,
    inProgress: 0,
    promise: undefined as Promise<void> | undefined,
    cleanup: undefined as CleanupFn | void,
    fromCleanup: false,
    recursing: false,
    refresh: () => {},
    refreshing: false,
    get: (() => {}) as Getter,
    set: (() => {}) as Setter,
    pendingError: null as null | unknown,
  }))

  const refreshAtom = atom(0)

  const initAtom = atom(null, (get, set) => {
    const ref = get(refAtom)
    ref.mounted = true
    ref.get = get
    ref.set = set
    ref.refresh = () => {
      try {
        ref.refreshing = true
        set(refreshAtom, (c) => c + 1)
      } finally {
        ref.refreshing = false
      }
    }
    set(refreshAtom, (c) => c + 1)
    return () => {
      ref.mounted = false
      throwIfPendingError(ref)
      ref.cleanup?.()
      ref.cleanup = undefined
    }
  })
  initAtom.onMount = (mount) => mount()
  const effectAtom = atom((get) => {
    get(refreshAtom)
    const ref = get(refAtom)
    if (!ref.mounted) {
      return ref.promise
    }
    if (ref.recursing) {
      return ref.promise
    }
    if (ref.inProgress && !ref.refreshing) {
      return ref.promise
    }
    throwIfPendingError(ref)
    const currDeps = new Map<Atom<unknown>, unknown>()
    const getter: GetterWithPeek = (a) => {
      const value = get(a)
      currDeps.set(a, value)
      return value
    }
    getter.peek = (anAtom) => ref.get(anAtom)
    const setter: SetterWithRecurse = (...args) => {
      try {
        ++ref.inProgress
        return ref.set(...args)
      } finally {
        --ref.inProgress
      }
    }
    setter.recurse = (anAtom, ...args) => {
      if (ref.fromCleanup) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('cannot recurse inside cleanup')
        }
        return undefined as any
      }
      try {
        ref.recursing = true
        return ref.set(anAtom, ...args)
      } finally {
        ref.recursing = false
        const depsChanged = Array.from(currDeps).some(([a, v]) => get(a) !== v)
        if (depsChanged) {
          ref.refresh()
        }
      }
    }
    ++ref.inProgress
    const effector = () => {
      try {
        ref.refreshing = false
        if (!ref.mounted) {
          return
        }
        try {
          ref.fromCleanup = true
          ref.cleanup?.()
        } finally {
          ref.fromCleanup = false
        }
        ref.cleanup = effectFn(getter, setter)
      } catch (error) {
        ref.pendingError = error
        ref.refresh()
      } finally {
        ref.promise = undefined
        --ref.inProgress
      }
    }
    return ref.refreshing
      ? effector()
      : (ref.promise = Promise.resolve().then(effector))
  })
  if (process.env.NODE_ENV !== 'production') {
    refAtom.debugPrivate = true
    refreshAtom.debugPrivate = true
    initAtom.debugPrivate = true
    effectAtom.debugPrivate = true
  }

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}

function throwIfPendingError(ref: { pendingError: null | unknown }) {
  if (ref.pendingError !== null) {
    const error = ref.pendingError
    ref.pendingError = null
    throw error
  }
}
