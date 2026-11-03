import type { Atom } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { atomEffect, deleteDependency, setDependency } from '../src/atomEffect'
import type { INTERNAL_AtomState as AtomState } from '../src/jotai-compat'
import { withAtomEffect } from '../src/withAtomEffect'
import { createDebugStore } from './test-utils'

type AnyAtom = Atom<unknown>

function inspect(store: ReturnType<typeof createDebugStore>) {
  const { atomStateMap, mountedMap } = store.state
  return {
    k: (a: AnyAtom) => (atomStateMap.get(a) as { k?: number }).k,
    mountedK: (a: AnyAtom) => (mountedMap.get(a) as { k?: number })?.k,
    mountedDeps: (a: AnyAtom) => new Set(mountedMap.get(a)?.d),
    isMounted: (a: AnyAtom) => mountedMap.has(a),
  }
}

describe('dependency revision helpers', () => {
  it('increments k only when a dependency key is added or removed', () => {
    const a = atom(0)
    const state = { d: new Map(), p: new Set(), n: 0, k: 0 } as AtomState<void>
    setDependency(state, a, 0)
    expect(state.k).toBe(1)
    setDependency(state, a, 1)
    expect(state.k).toBe(1)
    deleteDependency(state, a)
    expect(state.k).toBe(2)
    deleteDependency(state, a)
    expect(state.k).toBe(2)
  })

  it('works with atom states without k', () => {
    const a = atom(0)
    const state = { d: new Map(), p: new Set(), n: 0 } as AtomState<void>
    setDependency(state, a, 0)
    deleteDependency(state, a)
    expect(state).toEqual({ d: new Map(), p: new Set(), n: 0 })
  })
})

describe('atomEffect mounted dependencies', () => {
  it('mounts a previously unmounted atom read by the effect', () => {
    const a = atom(0)
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => effect(get(a)))
    const store = createDebugStore()
    const { k, mountedK, mountedDeps, isMounted } = inspect(store)
    expect(isMounted(a)).toBe(false)
    store.sub(effectAtom, () => {})
    expect(isMounted(a)).toBe(true)
    expect(mountedDeps(effectAtom).has(a)).toBe(true)
    expect(mountedK(effectAtom)).toBe(k(effectAtom))
    store.set(a, 1)
    expect(effect).toHaveBeenLastCalledWith(1)
    expect(effect).toHaveBeenCalledTimes(2)
  })

  it('switches dependencies from one atom to another', () => {
    const useB = atom(false)
    const a = atom(0)
    const b = atom(0)
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => effect(get(useB) ? get(b) : get(a)))
    const store = createDebugStore()
    const { k, mountedK, mountedDeps, isMounted } = inspect(store)
    store.sub(effectAtom, () => {})
    store.set(useB, true)
    expect(effect).toHaveBeenCalledTimes(2)
    store.set(b, 1)
    expect(effect).toHaveBeenCalledTimes(3)
    expect(effect).toHaveBeenLastCalledWith(1)
    expect(mountedDeps(effectAtom).has(b)).toBe(true)
    store.set(a, 1)
    expect(mountedDeps(effectAtom).has(a)).toBe(false)
    expect(isMounted(a)).toBe(false)
    expect(mountedK(effectAtom)).toBe(k(effectAtom))
    const callsAfterSwitch = effect.mock.calls.length
    store.set(a, 2)
    expect(effect).toHaveBeenCalledTimes(callsAfterSwitch)
  })

  it('subscribes to the new dependency when the switched value is equal', () => {
    const useB = atom(false)
    const a = atom(1)
    const b = atom(1)
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => effect(get(useB) ? get(b) : get(a)))
    const store = createDebugStore()
    const { mountedDeps } = inspect(store)
    store.sub(effectAtom, () => {})
    store.set(useB, true)
    expect(effect).toHaveBeenLastCalledWith(1)
    expect(mountedDeps(effectAtom).has(b)).toBe(true)
    store.set(b, 2)
    expect(effect).toHaveBeenLastCalledWith(2)
  })

  it('unmounts the final effect dependency and cleans up on unmount', () => {
    const active = atom(true)
    const a = atom(0)
    const onUnmountA = vi.fn()
    a.onMount = () => onUnmountA
    const cleanup = vi.fn()
    let readA = true
    const effectAtom = atomEffect((get) => {
      if (readA) get(a)
      get(active)
      return cleanup
    })
    const store = createDebugStore()
    const { isMounted } = inspect(store)
    const unsub = store.sub(effectAtom, () => {})
    readA = false
    store.set(active, false)
    store.set(a, 1)
    expect(isMounted(a)).toBe(false)
    expect(onUnmountA).toHaveBeenCalledOnce()
    cleanup.mockClear()
    unsub()
    expect(cleanup).toHaveBeenCalledOnce()
    expect(isMounted(active)).toBe(false)
  })

  it('does not subscribe to atoms read with get.peek', () => {
    const a = atom(0)
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => effect(get.peek(a)))
    const store = createDebugStore()
    const { mountedDeps } = inspect(store)
    store.sub(effectAtom, () => {})
    expect(mountedDeps(effectAtom).has(a)).toBe(false)
    store.set(a, 1)
    expect(effect).toHaveBeenCalledOnce()
  })
})

describe('withAtomEffect mounted dependencies', () => {
  it('re-runs on self changes without keeping the target as a dependency', () => {
    const base = atom(0)
    const other = atom(0)
    const effect = vi.fn()
    const withEffect = withAtomEffect(base, (get): void => {
      effect(get(withEffect), get(other))
    })
    withEffect.debugLabel = 'target'
    const store = createDebugStore()
    const { k, mountedK, mountedDeps } = inspect(store)
    let effectAtom: AnyAtom | undefined
    store.state.storeHooks.m.add(undefined, (a) => {
      if (a.debugLabel === 'target:effect') effectAtom = a
    })
    store.sub(withEffect, () => {})
    store.set(withEffect, 1)
    store.set(withEffect, 2)
    expect(effect.mock.calls).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
    const effectAtomState = store.state.atomStateMap.get(effectAtom!)!
    expect(effectAtomState.d.has(withEffect)).toBe(false)
    expect(mountedDeps(effectAtom!).has(withEffect)).toBe(false)
    expect(mountedDeps(effectAtom!).has(other)).toBe(true)
    expect(mountedK(effectAtom!)).toBe(k(effectAtom!))
    store.set(other, 1)
    expect(effect).toHaveBeenLastCalledWith(2, 1)
  })

  it('runs every effect for nested withAtomEffect', () => {
    const base = atom(0)
    const inner = vi.fn()
    const outer = vi.fn()
    const innerAtom: typeof base = withAtomEffect(base, (get): void => {
      inner(get(innerAtom))
    })
    const outerAtom: typeof base = withAtomEffect(innerAtom, (get): void => {
      outer(get(outerAtom))
    })
    const store = createDebugStore()
    store.sub(outerAtom, () => {})
    store.set(outerAtom, 1)
    expect(inner).toHaveBeenLastCalledWith(1)
    expect(outer).toHaveBeenLastCalledWith(1)
    expect(inner).toHaveBeenCalledTimes(2)
    expect(outer).toHaveBeenCalledTimes(2)
  })
})
