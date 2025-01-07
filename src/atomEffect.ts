import type { Atom, Getter, Setter, createStore } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type AnyAtom = Atom<unknown>
type Store = ReturnType<typeof createStore>

type GetAtomState = Parameters<Parameters<Store['unstable_derive']>[0]>[0]

type AtomState = NonNullable<ReturnType<GetAtomState>>

type Batch = Parameters<NonNullable<AtomState['u']>>[0]

type GetterWithPeek = Getter & { peek: Getter }

type SetterWithRecurse = Setter & { recurse: Setter }

type Cleanup = () => void

export type Effect = (
  get: GetterWithPeek,
  set: SetterWithRecurse
) => void | Cleanup

type Ref = {
  /** epoch */
  x: number
  /** in progress */
  i: number
  /** recursing */
  rc: number
  /** refreshing */
  rf?: boolean
  /** mounted */
  m?: boolean
  /** from cleanup */
  fc?: boolean
  /** getter */
  g?: Getter
  /** cleanup */
  c?: Cleanup | void
  /** pending error */
  e?: unknown
}

export function atomEffect(effect: Effect) {
  const refreshAtom = atom(0)

  const refAtom = atom(() => ({ i: 0, x: 0, rc: 0 }) as Ref)

  const internalAtom = atom((get) => {
    get(refreshAtom)
    const ref = get(refAtom)
    throwPendingError(ref)
    ref.g = get
    return ++ref.x
  })

  internalAtom.unstable_onInit = (store) => {
    const ref = store.get(refAtom)

    function runEffect() {
      if (!ref.m || ref.rc || (ref.i && !ref.rf)) {
        return
      }

      const deps = new Map<AnyAtom, unknown>()

      const getter = ((a) => {
        const value = ref.g!(a)
        deps.set(a, value)
        return value
      }) as GetterWithPeek
      getter.peek = store.get

      const setter = ((a, ...args) => {
        try {
          ++ref.i
          return store.set(a, ...args)
        } finally {
          deps.keys().forEach(ref.g!) // TODO - do we still need this?
          --ref.i
        }
      }) as SetterWithRecurse

      setter.recurse = (a, ...args) => {
        if (ref.fc) {
          if (process.env.NODE_ENV !== 'production') {
            throw new Error('set.recurse is not allowed in cleanup')
          }
          return void 0 as any
        }
        try {
          ++ref.rc
          return store.set(a, ...args)
        } finally {
          try {
            const depsChanged = Array.from(deps).some(areDifferent)
            if (depsChanged) {
              refresh()
            }
          } finally {
            --ref.rc
          }
        }
      }

      try {
        ++ref.i
        cleanup()
        ref.c = effectAtom.effect(getter, setter)
      } catch (e) {
        ref.e = e
        refresh()
      } finally {
        --ref.i
      }

      function areDifferent([a, v]: [Atom<unknown>, unknown]) {
        return getter.peek(a) !== v
      }
    }

    const atomState = getAtomState(store, internalAtom)

    const originalMountHook = atomState.h
    atomState.h = (batch) => {
      originalMountHook?.(batch)
      if (atomState.m) {
        ref.m = true
        scheduleListener(batch, runEffect)
      } else {
        ref.m = false
        scheduleListener(batch, cleanup)
      }
    }

    const originalUpdateHook = atomState.u
    atomState.u = (batch) => {
      originalUpdateHook?.(batch)
      batch[0].add(runEffect)
    }

    function scheduleListener(batch: Batch, listener: () => void) {
      batch[0].add(listener)
    }

    function refresh() {
      try {
        ref.rf = true
        store.set(refreshAtom, (v) => v + 1)
      } finally {
        ref.rf = false
      }
    }

    function cleanup() {
      if (typeof ref.c !== 'function') {
        return
      }
      try {
        ref.fc = true
        ref.c()
      } catch (e) {
        ref.e = e
        refresh()
      } finally {
        ref.fc = false
        delete ref.c
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    function setLabel(atom: Atom<unknown>, label: string) {
      Object.defineProperty(atom, 'debugLabel', {
        get: () => `${effectAtom.debugLabel ?? 'effect'}:${label}`,
      })
      atom.debugPrivate = true
    }
    setLabel(refreshAtom, 'refresh')
    setLabel(refAtom, 'ref')
    setLabel(internalAtom, 'internal')
  }

  const effectAtom = Object.assign(
    atom((get) => get(internalAtom)),
    { effect }
  )
  return effectAtom

  function throwPendingError(ref: Ref) {
    if ('e' in ref) {
      const error = ref.e
      delete ref.e
      throw error
    }
  }
}

const getAtomStateMap = new WeakMap<Store, GetAtomState>()

/**
 * HACK: steal atomState to synchronously determine if
 * the atom is mounted
 * We return null to cause the buildStore(...args) to throw
 * to abort creating a derived store
 */
function getAtomState(store: Store, atom: AnyAtom): AtomState {
  let getAtomStateFn = getAtomStateMap.get(store)
  if (!getAtomStateFn) {
    try {
      store.unstable_derive((...storeArgs) => {
        getAtomStateFn = storeArgs[0]
        return null as any
      })
    } catch {
      // expect error
    }
    getAtomStateMap.set(store, getAtomStateFn!)
  }
  return getAtomStateFn!(atom)!
}
