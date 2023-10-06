import type { Getter, Setter, WritableAtom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'

type CleanupFn = () => PromiseOrValue<void>
type PromiseOrValue<T> = Promise<T> | T

export function atomEffect(
  effectFn: (get: Getter, set: Setter) => PromiseOrValue<void | CleanupFn>
) {
  const refAtom = atom<{
    mounted: boolean
    rerun: boolean
    inProgress: number
    cleanup: CleanupFn | void
  }>({
    mounted: false,
    rerun: false,
    inProgress: 0,
    cleanup: undefined,
  })
  const initAtom = atom(null, (get, _set, mounted: boolean) => {
    const ref = get(refAtom)
    if (mounted) {
      ref.mounted = true
    } else {
      ref.cleanup?.() // do not await
      ref.mounted = false
      ref.rerun = false
      ref.cleanup = undefined
    }
  })
  initAtom.onMount = (init) => {
    init(true)
    return () => init(false)
  }

  const effectAtom = atom(
    async (get, { setSelf }) => {
      const ref = get(refAtom)
      if (!ref.mounted) {
        return
      }
      if (ref.inProgress) {
        ref.rerun = true
        return
      }
      do {
        ref.rerun = false
        await ref.cleanup?.()
        ref.inProgress++
        const cleanup = await effectFn(get, setSelf as Setter)
        ref.inProgress--
        ref.cleanup = cleanup
      } while (ref.rerun)
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
