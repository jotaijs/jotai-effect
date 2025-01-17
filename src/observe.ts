import { getDefaultStore } from 'jotai/vanilla'
import { Effect, atomEffect } from './atomEffect'

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
  if (!effectSubscriptions.has(effect)) {
    const unsubscribe = store.sub(atomEffect(effect), () => void 0)
    effectSubscriptions.set(effect, unsubscribe)
  }
  return function unobserve() {
    const effectSubscriptions = storeEffects.get(store)
    const unsubscribe = effectSubscriptions?.get(effect)
    if (unsubscribe) {
      effectSubscriptions!.delete(effect)
      if (effectSubscriptions!.size === 0) {
        storeEffects.delete(store)
      }
      unsubscribe()
    }
  }
}
