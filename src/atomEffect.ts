import type { Getter, Setter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type CleanupFn = () => void

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => void | CleanupFn
) {
  const refAtom = atom(() => ({
    mounted: false,
    inProgress: 0,
    promise: undefined as Promise<void> | undefined,
    cleanup: undefined as CleanupFn | void,
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
    ref.mounted = mounted
    if (mounted) {
      set(refreshAtom, (c) => c + 1)
    } else {
      ref.cleanup?.()
      ref.cleanup = undefined
    }
  })
  initAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }
  if (process.env.NODE_ENV !== 'production') {
    initAtom.debugPrivate = true
  }

  const effectAtom = atom(
    (get, { setSelf }) => {
      get(refreshAtom)
      const ref = get(refAtom)
      if (!ref.mounted || ref.inProgress) {
        return ref.promise
      }
      ++ref.inProgress
      return (ref.promise = Promise.resolve().then(() => {
        try {
          if (!ref.mounted) return
          ref.cleanup?.()
          ref.cleanup = effectFn(get, setSelf as Setter)
        } finally {
          --ref.inProgress
          ref.promise = undefined
        }
      }))
    },
    (get, set, ...args: Parameters<Setter>) => {
      const ref = get(refAtom)
      ++ref.inProgress
      try {
        return set(...args)
      } finally {
        --ref.inProgress
      }
    }
  )
  if (process.env.NODE_ENV !== 'production') {
    effectAtom.debugPrivate = true
  }

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}
