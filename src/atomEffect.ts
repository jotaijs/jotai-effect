import type { Atom, Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type AnyAtom = Atom<unknown>
type GetterWithPeek = Getter & { peek: Getter }
type SetterWithRecurse = Setter & { recurse: Setter }
type Cleanup = () => void
export type Effect = (
  get: GetterWithPeek,
  set: SetterWithRecurse
) => void | Cleanup
type Ref = {
  get: GetterWithPeek
  set?: SetterWithRecurse
  peek?: Getter
  cleanup?: Cleanup | null
  fromCleanup: boolean
  inProgress: number
  isPending: boolean
  deps: Set<AnyAtom>
  sub: () => () => void
  epoch: number
}

export function atomEffect(effect: Effect) {
  const refAtom = atom(
    () => ({ deps: new Set(), inProgress: 0, epoch: 0 }) as Ref,
    (get, set) => {
      const ref = get(refAtom)
      if (!ref.get.peek) {
        ref.get.peek = get
      }
      const setter: Setter = (a, ...args) => {
        try {
          ++ref.inProgress
          return set(a, ...args)
        } finally {
          --ref.inProgress
        }
      }
      const recurse: Setter = (a, ...args) => {
        if (ref.fromCleanup) {
          if (process.env?.MODE !== 'production') {
            console.warn('cannot recurse inside cleanup')
          }
          return undefined as any
        }
        return set(a, ...args)
      }
      if (!ref.set) {
        ref.set = Object.assign(setter, { recurse })
      }
      ref.isPending = ref.inProgress === 0
      return () => {
        ref.cleanup?.()
        ref.cleanup = null
        ref.isPending = false
        ref.deps.clear()
      }
    }
  )
  refAtom.onMount = (mount) => mount()
  const refreshAtom = atom(0)
  const internalAtom = atom((get) => {
    get(refreshAtom)
    const ref = get(refAtom)
    if (!ref.get) {
      ref.get = ((a) => {
        ref.deps.add(a)
        return get(a)
      }) as Getter & { peek: Getter }
    }
    ref.deps.forEach(get)
    ref.isPending = true
    return ++ref.epoch
  })
  const bridgeAtom = atom(
    (get) => get(internalAtom),
    (get, set) => {
      set(refreshAtom, (v) => ++v)
      return get(refAtom).sub()
    }
  )
  bridgeAtom.onMount = (mount) => mount()
  bridgeAtom.unstable_onInit = (store) => {
    store.get(refAtom).sub = () => {
      const listener = () => {
        const ref = store.get(refAtom)
        if (!ref.isPending || ref.inProgress > 0) {
          return
        }
        ref.isPending = false
        ref.cleanup?.()
        const cleanup = effectAtom.effect(ref.get!, ref.set!)
        ref.cleanup =
          typeof cleanup === 'function'
            ? () => {
                try {
                  ref.fromCleanup = true
                  cleanup()
                } finally {
                  ref.fromCleanup = false
                }
              }
            : null
      }
      return store.sub(internalAtom, listener, 'H')
    }
  }
  const effectAtom = Object.assign(
    atom((get) => void get(bridgeAtom)),
    { effect }
  )
  return effectAtom
}
