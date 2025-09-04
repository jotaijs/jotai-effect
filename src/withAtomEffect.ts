import type { Atom, WritableAtom } from 'jotai/vanilla'
import {
  INTERNAL_getBuildingBlocksRev1 as getBuildingBlocks,
  INTERNAL_initializeStoreHooks as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import type { Effect, GetterWithPeek, SetterWithRecurse } from './atomEffect'
import { atomEffect } from './atomEffect'
import { isDev } from './env'

export function withAtomEffect<T extends Atom<unknown>>(
  targetAtom: T,
  effect: Effect
): T & { effect: Effect } {
  const proto = Object.getPrototypeOf(targetAtom)
  const desc = Object.getOwnPropertyDescriptors(targetAtom)
  let depth = 0
  desc.read.value = function read(get, options) {
    try {
      ++depth
      // handles case when withAtomEffect is nested
      const context = depth === 1 ? targetAtom : this
      return targetAtom.read.call(context, get, options)
    } finally {
      --depth
    }
  }
  if (isWritableAtom(targetAtom)) {
    desc.write!.value = function write(this: T, get, set, ...args) {
      try {
        ++depth
        const context = depth === 1 ? targetAtom : this
        return targetAtom.write.call(context, get, set, ...args)
      } finally {
        --depth
      }
    } as (typeof targetAtom)['write']
  }
  const targetWithEffect: T & { effect: Effect } = Object.create(proto, desc)
  targetWithEffect.unstable_onInit = (store) => {
    const buildingBlocks = getBuildingBlocks(store)
    const invalidatedAtoms = buildingBlocks[2]
    const storeHooks = initializeStoreHooks(buildingBlocks[6])
    const ensureAtomState = buildingBlocks[11]
    const flushCallbacks = buildingBlocks[12]
    const readAtomState = buildingBlocks[14]
    const mountDependencies = buildingBlocks[17]
    const mountAtom = buildingBlocks[18]
    const unmountAtom = buildingBlocks[19]

    let inProgress = false
    let isSubscribed = false
    const effectAtom = atomEffect((get, set) => {
      if (inProgress) {
        return
      }
      isSubscribed = false
      const getter: GetterWithPeek = (a) => {
        if (a === targetWithEffect) {
          isSubscribed = true
          return get.peek(a)
        }
        return get(a)
      }
      getter.peek = get.peek
      const setter: SetterWithRecurse = (a, ...args) => {
        if (a === (targetWithEffect as any)) {
          inProgress = true
          return set(a, ...args)
        }
        return set(a, ...args)
      }
      setter.recurse = (...args) => {
        inProgress = false
        return set.recurse(...args)
      }
      return targetWithEffect.effect.call(targetAtom, getter, setter)
    })
    if (isDev()) {
      Object.defineProperty(effectAtom, 'debugLabel', {
        get: () => `${targetWithEffect.debugLabel ?? 'atom'}:effect`,
      })
      effectAtom.debugPrivate = true
    }
    const effectAtomState = ensureAtomState(effectAtom)
    const targetWithEffectAtomState = ensureAtomState(targetWithEffect)

    storeHooks.c.add(targetWithEffect, function atomChanged() {
      if (isSubscribed) {
        invalidatedAtoms.set(effectAtom, effectAtomState.n)
        effectAtomState.d.set(targetWithEffect, targetWithEffectAtomState.n - 1)
        readAtomState(effectAtom)
        mountDependencies(effectAtom)
        invalidatedAtoms.delete(effectAtom)
        effectAtomState.d.delete(targetWithEffect)
      }
    })
    storeHooks.m.add(targetWithEffect, function mountEffect() {
      mountAtom(effectAtom)
      flushCallbacks()
    })
    storeHooks.u.add(targetWithEffect, function unmountEffect() {
      unmountAtom(effectAtom)
      flushCallbacks()
    })
    storeHooks.f.add(function flushEffect() {
      inProgress = false
    })
  }
  targetWithEffect.effect = effect
  return targetWithEffect
}

function isWritableAtom(
  atom: Atom<unknown>
): atom is WritableAtom<unknown, any[], any> {
  return 'write' in atom && typeof atom.write === 'function'
}
