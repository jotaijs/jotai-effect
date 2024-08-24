import type { Atom, Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import type { EffectFn } from './atomEffect'
import { atomEffect } from './atomEffect'

export function withAtomEffect<Value, Args extends unknown[], Result>(
  targetAtom: WritableAtom<Value, Args, Result>,
  effectFn: EffectFn
): WritableAtom<Value, Args, Result>

export function withAtomEffect<Value>(
  targetAtom: Atom<Value>,
  effectFn: EffectFn
): Atom<Value>

export function withAtomEffect<Value, Args extends unknown[], Result>(
  targetAtom: Atom<Value> | WritableAtom<Value, Args, Result>,
  effectFn: EffectFn
): Atom<Value> | WritableAtom<Value, Args, Result> {
  const effect = atomEffect(effectFn)
  const readFn = (get: Getter) => void get(effect) ?? get(targetAtom)
  if ('write' in targetAtom) {
    type WriteFn = (get: Getter, set: Setter, ...args: Args) => Result
    const writeFn: WriteFn = (_, set, ...args) => set(targetAtom, ...args)
    return atom(readFn, writeFn)
  }
  return atom(readFn)
}
