import type { Atom, Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type Cleanup = () => void
type GetterWithPeak = Getter & { peek: Getter }
type SetterWithRecurse = Setter & { recurse: Setter }
export type Effect = (
  get: GetterWithPeak,
  set: SetterWithRecurse
) => void | Cleanup
export type AtomWithEffect<T extends Atom<unknown> = Atom<void>> = T & {
  effect: Effect
}

type Ref = {
  get: GetterWithPeak
  set?: SetterWithRecurse
  cleanup?: Cleanup | null
  fromCleanup: boolean
  inProgress: number
  deps: Set<Atom<unknown>>
  init: () => void
}

export function atomEffect(effect: Effect) {
  const refAtom = atom(
    () => ({ deps: new Set(), inProgress: 0 }) as Ref,
    (get) => {
      const ref = get(refAtom)
      return () => {
        ref.cleanup?.()
        ref.cleanup = null
        ref.deps.clear()
      }
    }
  )
  refAtom.onMount = (mount) => mount()
  const internalAtom = atom((get) => {
    const ref = get(refAtom)
    if (!ref.get) {
      ref.get = ((a) => {
        ref.deps.add(a)
        return get(a)
      }) as Getter & { peek: Getter }
    }
    ref.init()
    ref.deps.forEach(get)
    if (ref.inProgress > 0) {
      return
    }
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
  })
  internalAtom.unstable_onInit = (store) => {
    const ref = store.get(refAtom)
    const get = store.get
    const set = store.set
    ref.init = () => {
      if (!ref.get.peek) {
        ref.get.peek = get
      }
      if (!ref.set) {
        const setter: Setter = (a, ...args) => {
          try {
            ++ref.inProgress
            return set(a, ...args)
          } finally {
            --ref.inProgress
            ref.get(a) // FIXME why do we need this?
          }
        }
        const recurse: Setter = (a, ...args) => {
          if (ref.fromCleanup) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('cannot recurse inside cleanup')
            }
            return undefined as any
          }
          return set(a, ...args)
        }
        ref.set = Object.assign(setter, { recurse })
      }
    }
  }
  const effectAtom = Object.assign(
    atom((get) => get(internalAtom)),
    { effect }
  )
  return effectAtom
}
