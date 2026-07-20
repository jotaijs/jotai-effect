import type { Atom, WritableAtom } from 'jotai/vanilla'
import type { Effect, GetterWithPeek, SetterWithRecurse } from './atomEffect'
import { atomEffect } from './atomEffect'
import { isDev } from './env'
import {
  INTERNAL_KEY_ensureAtomState,
  INTERNAL_KEY_flushCallbacks,
  INTERNAL_KEY_invalidateDependents,
  INTERNAL_KEY_invalidatedAtoms,
  INTERNAL_KEY_mountAtom,
  INTERNAL_KEY_mountDependencies,
  INTERNAL_KEY_readAtomState,
  INTERNAL_KEY_storeHooks,
  INTERNAL_KEY_unmountAtom,
  INTERNAL_getBuildingBlocks as getBuildingBlocks,
  INTERNAL_initializeStoreHooks as initializeStoreHooks,
} from './jotai-compat'

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
  targetWithEffect.INTERNAL_onInit = (store) => {
    const buildingBlocks = getBuildingBlocks(store)
    const invalidatedAtoms = buildingBlocks[INTERNAL_KEY_invalidatedAtoms]
    const storeHooks = initializeStoreHooks(
      buildingBlocks[INTERNAL_KEY_storeHooks]
    )
    const ensureAtomState = buildingBlocks[INTERNAL_KEY_ensureAtomState]
    const flushCallbacks = buildingBlocks[INTERNAL_KEY_flushCallbacks]
    const readAtomState = buildingBlocks[INTERNAL_KEY_readAtomState]
    const invalidateDependents =
      buildingBlocks[INTERNAL_KEY_invalidateDependents]
    const mountDependencies = buildingBlocks[INTERNAL_KEY_mountDependencies]
    const mountAtom = buildingBlocks[INTERNAL_KEY_mountAtom]
    const unmountAtom = buildingBlocks[INTERNAL_KEY_unmountAtom]

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
    const effectAtomState = ensureAtomState(buildingBlocks, store, effectAtom)
    const targetWithEffectAtomState = ensureAtomState(
      buildingBlocks,
      store,
      targetWithEffect
    )

    storeHooks.c.add(targetWithEffect, function atomChanged() {
      if (isSubscribed) {
        invalidatedAtoms.set(effectAtom, effectAtomState.n)
        effectAtomState.d.set(targetWithEffect, targetWithEffectAtomState.n - 1)
        readAtomState(buildingBlocks, store, effectAtom)
        mountDependencies(buildingBlocks, store, effectAtom)
        invalidatedAtoms.delete(effectAtom)
        effectAtomState.d.delete(targetWithEffect)
      }
    })
    storeHooks.m.add(targetWithEffect, function mountEffect() {
      const atomState = ensureAtomState(buildingBlocks, store, targetWithEffect)
      const { n } = atomState
      // Defer effect mount to the next flush `f` so nested mount waves do not replace mounted maps
      // after inner passes have populated mounted.t, which can strand invalidation edges (#3292).
      const unsubFlush = storeHooks.f.add(() => {
        unsubFlush()
        mountAtom(buildingBlocks, store, effectAtom)
        if (n !== atomState.n) {
          const unsubPost = storeHooks.f.add(() => {
            unsubPost()
            invalidateDependents(buildingBlocks, store, targetWithEffect)
          })
        }
        flushCallbacks(buildingBlocks, store)
      })
    })
    storeHooks.u.add(targetWithEffect, function unmountEffect() {
      unmountAtom(buildingBlocks, store, effectAtom)
      flushCallbacks(buildingBlocks, store)
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
