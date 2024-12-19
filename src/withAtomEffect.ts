import type { Atom, WritableAtom } from 'jotai/vanilla'
import type { AtomWithEffect, Effect } from './atomEffect'
import { atomEffect } from './atomEffect'

export function withAtomEffect<T extends Atom<unknown>>(
  targetAtom: T,
  effect: Effect
): AtomWithEffect<T> {
  const effectAtom = atomEffect(effect)
  const descriptors = Object.getOwnPropertyDescriptors(
    targetAtom as AtomWithEffect<T>
  )
  descriptors.read.value = (get, options) => {
    try {
      return targetAtom.read(get, options)
    } finally {
      get(effectAtom)
    }
  }
  if ('write' in targetAtom && typeof targetAtom.write === 'function') {
    descriptors.write!.value = targetAtom.write.bind(targetAtom)
  }
  descriptors.effect = {
    get() {
      return effectAtom.effect
    },
    set(newEffect) {
      effectAtom.effect = newEffect
    },
  } as typeof descriptors.effect
  // avoid reading `init` to preserve lazy initialization
  return Object.create(Object.getPrototypeOf(targetAtom), descriptors)
}
