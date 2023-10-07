import type { Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type PromiseOrValue<T> = Promise<T> | T
type CleanupFn = () => PromiseOrValue<void>

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const refAtom = atom(() => ({
    mounted: false,
    inProgress: false,
    cleanup: undefined as void | CleanupFn,
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
      if (!ref.mounted) {
        return
      }
      if (ref.inProgress) {
        throw new Error('infinite loop detected')
      }
      ref.inProgress = true
      await ref.cleanup?.()
      ref.cleanup = await effectFn(get, setSelf as Setter)
      ref.inProgress = false
    },
    (
      _get,
      set,
      a: WritableAtom<unknown, unknown[], unknown>,
      ...args: unknown[]
    ) => set(a, ...args)
  )

  return atom((get) => {
    get(initAtom)
    get(effectAtom)
  })
}
