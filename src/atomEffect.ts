import type { Atom, Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type Cleanup = () => void

type GetterWithPeek = Getter & { peek: Getter }

type SetterWithRecurse = Setter & { recurse: Setter }

export type Effect = (
  get: GetterWithPeek,
  set: SetterWithRecurse
) => void | Cleanup

type Ref = {
  /** inProgress */
  i: number
  /** mounted */
  m: boolean
  /** promise */
  p: Promise<void> | undefined
  /** pending error */
  e?: unknown
  /** cleanup */
  c: Cleanup | void
  /** from cleanup */
  fc: boolean
  /** is recursing */
  irc: boolean
  /** is refreshing */
  irf: boolean
  peek: Getter
  set: Setter
}

export function atomEffect(
  effect: (get: GetterWithPeek, set: SetterWithRecurse) => void | Cleanup
): Atom<void> & { effect: Effect } {
  const refreshAtom = atom(0)
  const refAtom = atom(
    () => ({ i: 0 }) as Ref,
    (get, set) => {
      const ref = get(refAtom)
      Object.assign(ref, { m: true, peek: get, set })
      set(refreshAtom, (c) => c + 1)
      return () => {
        ref.m = false
        cleanup(ref)
        throwPendingError(ref)
      }
    }
  )
  refAtom.onMount = (mount) => mount()
  const baseAtom = atom((get) => {
    get(refreshAtom)
    const ref = get(refAtom)
    if (!ref.m || ref.irc || (ref.i && !ref.irf)) {
      return ref.p
    }
    throwPendingError(ref)
    const currDeps = new Map<Atom<unknown>, unknown>()
    const getter: GetterWithPeek = (a) => {
      const value = get(a)
      currDeps.set(a, value)
      return value
    }
    getter.peek = ref.peek
    const setter: SetterWithRecurse = (...args) => {
      try {
        ++ref.i
        return ref.set(...args)
      } finally {
        Array.from(currDeps.keys(), get)
        --ref.i
      }
    }
    setter.recurse = (anAtom, ...args) => {
      if (ref.fc) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error('set.recurse is not allowed in cleanup')
        }
        return undefined as any
      }
      try {
        ref.irc = true
        return ref.set(anAtom, ...args)
      } finally {
        ref.irc = false
        const depsChanged = Array.from(currDeps).some(areDifferent)
        if (depsChanged) {
          refresh(ref)
        }
      }
    }
    function areDifferent([a, v]: [Atom<unknown>, unknown]) {
      return get(a) !== v
    }
    ++ref.i
    function runEffect() {
      try {
        ref.irf = false
        if (!ref.m) return
        cleanup(ref)
        ref.c = effectAtom.effect(getter, setter)
      } catch (error) {
        ref.e = error
        refresh(ref)
      } finally {
        ref.p = undefined
        --ref.i
      }
    }
    return ref.irf ? runEffect() : (ref.p = Promise.resolve().then(runEffect))
  })
  if (process.env.NODE_ENV !== 'production') {
    function setLabel(atom: Atom<unknown>, label: string) {
      Object.defineProperty(atom, 'debugLabel', {
        get: () => `${effectAtom.debugLabel ?? 'effect'}:${label}`,
      })
      atom.debugPrivate = true
    }
    setLabel(refreshAtom, 'refresh')
    setLabel(refAtom, 'ref')
    setLabel(baseAtom, 'base')
  }
  const effectAtom = atom((get) => void get(baseAtom)) as Atom<void> & {
    effect: Effect
  }
  effectAtom.effect = effect
  return effectAtom
  function refresh(ref: Ref) {
    try {
      ref.irf = true
      ref.set(refreshAtom, (c) => c + 1)
    } finally {
      ref.irf = false
    }
  }
  function cleanup(ref: Ref) {
    if (typeof ref.c !== 'function') return
    try {
      ref.fc = true
      ref.c()
    } finally {
      ref.fc = false
      ref.c = undefined
    }
  }
  function throwPendingError(ref: Ref) {
    if ('e' in ref) {
      const error = ref.e
      delete ref.e
      throw error
    }
  }
}
