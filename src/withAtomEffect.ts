import type { Atom } from 'jotai/vanilla'
import { atomEffect } from './atomEffect'

type Effect = typeof atomEffect extends (effect: infer E) => Atom<infer _>
  ? E
  : never

export function withAtomEffect<T extends Atom<any>>(
  targetAtom: T,
  effectFn: Effect
): T {
  const effectAtom = atomEffect(effectFn)
  const descriptors = Object.getOwnPropertyDescriptors(targetAtom)
  descriptors.read.value = (get, options) => {
    try {
      return targetAtom.read(get, options)
    } finally {
      get(effectAtom)
    }
  }
  // avoid reading `init` to preserve lazy initialization
  return Object.create(Object.getPrototypeOf(targetAtom), descriptors)
}
