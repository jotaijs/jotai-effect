import type { Atom } from 'jotai/vanilla'
import type { Effect } from './atomEffect'
import { atomEffect } from './atomEffect'

type AtomWithEffect<T extends Atom<unknown>> = T & { effect: Effect }

export function withAtomEffect<T extends Atom<unknown>>(
  targetAtom: T,
  effect: Effect
): AtomWithEffect<T> {
  const effectAtom = atomEffect((get, set) => {
    const getter = ((a) => (a === targetWithEffect ? get(targetAtom) : get(a))) as typeof get
    getter.peek = get.peek
    return targetWithEffect.effect(getter, set)
  })
  if (process.env.NODE_ENV !== 'production') {
    Object.defineProperty(effectAtom, 'debugLabel', {
      get: () => `${targetWithEffect.debugLabel ?? 'atomWithEffect'}:effect`,
    })
    effectAtom.debugPrivate = true
  }
  const descriptors = Object.getOwnPropertyDescriptors(targetAtom as AtomWithEffect<T>)
  descriptors.read.value = (get) => {
    try {
      return get(targetAtom)
    } finally {
      get(effectAtom)
    }
  }
  if ('write' in targetAtom && typeof targetAtom.write === 'function') {
    descriptors.write!.value = targetAtom.write.bind(targetAtom)
    delete descriptors.onMount
  }
  // avoid reading `init` to preserve lazy initialization
  const targetPrototype = Object.getPrototypeOf(targetAtom)
  const targetWithEffect = Object.create(targetPrototype, descriptors)
  targetWithEffect.effect = effect
  return targetWithEffect
}
