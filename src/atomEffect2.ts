import type { Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type CleanupFn = () => PromiseOrValue<void>
type PromiseOrValue<T> = Promise<T> | T

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const refAtom = atom<{
    mounted: boolean
    inProgress: number
    cleanup: CleanupFn | void
  }>(() => ({
    mounted: false,
    inProgress: 0,
    cleanup: undefined,
  }))

  const refreshAtom = atom(0)

  const initAtom = atom(null, (get, set, mounted: boolean) => {
    const ref = get(refAtom)
    if (mounted) {
      ref.mounted = true
      set(refreshAtom, (c) => c + 1)
    } else {
      ref.cleanup?.() // do not await
      ref.cleanup = undefined
      ref.mounted = false
    }
  })
  initAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }

  const effectAtom = atom(
    async (get, { setSelf }) => {
      get(refreshAtom)
      const ref = get(refAtom)
      if (!ref.mounted || ref.inProgress) {
        return
      }
      await ref.cleanup?.()
      const cleanup = await effectFn(get, setSelf as Setter)
      ref.cleanup = cleanup
    },
    (
      get,
      set,
      a: WritableAtom<unknown, unknown[], unknown>,
      ...args: unknown[]
    ) => {
      const ref = get(refAtom)
      ref.inProgress++
      const result = set(a, ...args)
      ref.inProgress--
      return result
    }
  )

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}
