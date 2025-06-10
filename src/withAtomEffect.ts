import type { Atom } from 'jotai/vanilla'
import {
  INTERNAL_getBuildingBlocksRev1 as getBuildingBlocks,
  INTERNAL_initializeStoreHooks as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import type { Effect } from './atomEffect'
import { atomEffect } from './atomEffect'
import { isDev } from './env'

export function withAtomEffect<T extends Atom<unknown>>(
  targetAtom: T,
  effect: Effect
): T & { effect: Effect } {
  const effectAtom = atomEffect((get, set) => {
    const getter = ((a) =>
      a === targetWithEffect ? get(targetAtom) : get(a)) as typeof get
    getter.peek = get.peek
    return targetWithEffect.effect.call(targetAtom, getter, set)
  })
  if (isDev()) {
    Object.defineProperty(effectAtom, 'debugLabel', {
      get: () => `${targetWithEffect.debugLabel ?? 'atomWithEffect'}:effect`,
    })
    effectAtom.debugPrivate = true
  }
  const descriptors = Object.getOwnPropertyDescriptors(targetAtom)
  descriptors.read.value = targetAtom.read.bind(targetAtom)
  if ('write' in targetAtom && typeof targetAtom.write === 'function') {
    descriptors.write!.value = targetAtom.write.bind(targetAtom)
  }
  // avoid reading `init` to preserve lazy initialization
  const targetPrototype = Object.getPrototypeOf(targetAtom)
  const targetWithEffect: T & { effect: Effect } = Object.create(
    targetPrototype,
    descriptors
  )
  targetWithEffect.unstable_onInit = (store) => {
    const buildingBlocks = getBuildingBlocks(store)
    const storeHooks = initializeStoreHooks(buildingBlocks[6])
    let unsub: () => void
    storeHooks.m.add(targetWithEffect, function mountEffect() {
      unsub = store.sub(effectAtom, () => {})
    })
    storeHooks.u.add(targetWithEffect, function unmountEffect() {
      unsub!()
    })
  }
  targetWithEffect.effect = effect
  return targetWithEffect
}
