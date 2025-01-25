import { getDefaultStore } from 'jotai/vanilla'
import type { Effect } from './atomEffect'
import { atomEffect } from './atomEffect'

type Store = ReturnType<typeof getDefaultStore>
type Unobserve = () => void

const storeEffects = new WeakMap<Store, Map<Effect, Unobserve>>()

export function observe(
  effect: Effect,
  store: Store = getDefaultStore()
): Unobserve {
  if (!storeEffects.has(store)) {
    storeEffects.set(store, new Map<Effect, Unobserve>())
  }
  const effectSubscriptions = storeEffects.get(store)!
  let unobserve = effectSubscriptions.get(effect)
  if (!unobserve) {
    const effectAtom = atomEffect(effect)
    let unsubscribe: (() => void) | void = store.sub(effectAtom, () => {})
    unobserve = () => {
      if (unsubscribe) {
        effectSubscriptions.delete(effect)
        if (effectSubscriptions.size === 0) {
          storeEffects.delete(store)
        }
        unsubscribe = void unsubscribe()
      }
    }
    effectSubscriptions.set(effect, unobserve)
  }
  return unobserve!
}
