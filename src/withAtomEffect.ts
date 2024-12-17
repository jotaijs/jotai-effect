import type { Atom } from 'jotai/vanilla'
import { atomEffect } from './atomEffect'

type Effect = Parameters<typeof atomEffect>[0]

export function withAtomEffect<T extends Atom<any>>(
  targetAtom: T,
  effect: Effect
): T {
  const effectAtom = atomEffect(effect)
  const descriptors = Object.getOwnPropertyDescriptors(targetAtom)
  descriptors.read.value = (get, options) => {
    try {
      return targetAtom.read(get, options)
    } finally {
      get(effectAtom)
    }
  }
  if ('write' in targetAtom) {
    descriptors.write!.value = (targetAtom as any).write.bind(targetAtom)
  }
  // avoid reading `init` to preserve lazy initialization
  return Object.create(Object.getPrototypeOf(targetAtom), descriptors)
}
