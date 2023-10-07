import type { Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type PromiseOrValue<T> = Promise<T> | T
type CleanupFn = () => PromiseOrValue<void>
type State = {
  mounted: boolean
  inProgress: number
  cleanup: CleanupFn | void
}
export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const refAtom = atom<State>(() => ({
    mounted: false,
    inProgress: 0,
    cleanup: undefined,
  }))
  if (process.env.NODE_ENV !== 'production') {
    refAtom.debugPrivate = true
  }

  const refreshAtom = atom(0)
  if (process.env.NODE_ENV !== 'production') {
    refreshAtom.debugPrivate = true
  }

  const initAtom = atom(null, (get, set, mounted: boolean) => {
    const ref = get(refAtom)
    if (mounted) {
      ref.mounted = true
      set(refreshAtom, (c) => c + 1)
    } else {
      ref.cleanup?.()
      ref.cleanup = undefined
      ref.mounted = false
    }
  })
  initAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }
  if (process.env.NODE_ENV !== 'production') {
    initAtom.debugPrivate = true
  }

  const makeSetter =
    (set: Setter, ref: State) =>
    (...args: Parameters<Setter>) => {
      let result
      ++ref.inProgress
      try {
        result = set(...args)
      } finally {
        --ref.inProgress
      }
      return result
    }

  const effectAtom = atom(
    async (get, { setSelf }) => {
      get(refreshAtom)
      const ref = get(refAtom)
      if (!ref.mounted || ref.inProgress) {
        return
      }
      ++ref.inProgress
      try {
        const setter = makeSetter(setSelf as Setter, ref) as Setter
        await ref.cleanup?.()
        ref.cleanup = await effectFn(get, setter)
      } finally {
        --ref.inProgress
      }
    },
    (_get, set, ...args: Parameters<Setter>) => set(...args)
  )
  if (process.env.NODE_ENV !== 'production') {
    effectAtom.debugPrivate = true
  }

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}
