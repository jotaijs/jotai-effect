import { getDefaultStore } from 'jotai/vanilla'
import { Effect, atomEffect } from './atomEffect'

type Store = ReturnType<typeof getDefaultStore>
type Unobserve = () => Reobserve
type Reobserve = () => Unobserve

const storeEffects = new WeakMap<Store, Map<Effect, Unobserve>>()

/**
 * Mounts an effect with the specified Jotai store.
 * @param effect - The effect to be mounted.
 * @param store - The Jotai store to mount the effect on. Defaults to the global store when not provided.
 * @returns A stable `unobserve` function that, when called, removes the effect from the store and cleans up any internal references.
 * `unobserve` returns a stable `reobserve` function that can be used to reattach the effect to the store.
 */
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
    const reobserve: Reobserve = () => (unobserve = observe(effect, store))
    unobserve = (): Reobserve => {
      if (unsubscribe) {
        effectSubscriptions.delete(effect)
        if (effectSubscriptions.size === 0) {
          storeEffects.delete(store)
        }
        unsubscribe = unsubscribe()
      }
      return reobserve
    }
    effectSubscriptions.set(effect, unobserve)
  }
  return unobserve!
}
