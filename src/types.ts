import type { Atom, Getter, Setter, WritableAtom } from 'jotai'

export type CleanupFn = () => PromiseOrValue<void>

export type EffectFn = (
  get: Getter,
  set: Setter
) => PromiseOrValue<CleanupFn | void>

export type InternalState = {
  inProgress: number
  cleanup: CleanupFn | void
  dependencyMap: Map<Atom<unknown>, unknown>
}

export type PromiseOrValue<T> = Promise<T> | T

type Write<Args extends unknown[], Result> = WritableAtom<
  unknown,
  Args,
  Result
>['write']

export type WriteFn<Result = PromiseOrValue<void>> = Write<[], Result>
