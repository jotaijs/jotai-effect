import { type Getter, atom, createStore, getDefaultStore } from 'jotai/vanilla'
import { describe, expect, it } from 'vitest'
import { observe } from '../src/observe'

describe('observe', () => {
  it('should run effect on subscription and cleanup on unsubscribe', async () => {
    const countAtom = atom(0)
    let mounted = 0

    const unsubscribe = observe((get, _set) => {
      mounted++
      get(countAtom)
      return () => {
        mounted--
      }
    })

    expect(mounted).toBe(1)
    unsubscribe()
    expect(mounted).toBe(0)
  })

  it('should reuse existing subscription for the same effect', async () => {
    const countAtom = atom(0)
    let runCount = 0

    const effect = (get: any) => {
      runCount++
      get(countAtom)
    }
    const store = getDefaultStore()

    const unsubscribe1 = observe(effect, store)
    const unsubscribe2 = observe(effect, store)

    expect(runCount).toBe(1)

    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)
    unsubscribe1()
    unsubscribe2()
    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)
  })

  it('should unsubscribe the effect when any of effect subscriptions are unsubscribed', async () => {
    const countAtom = atom(0)
    let runCount = 0

    const effect = (get: any) => {
      runCount++
      get(countAtom)
    }
    const store = getDefaultStore()

    const unsubscribe1 = observe(effect, store)
    const unsubscribe2 = observe(effect, store)

    expect(runCount).toBe(1)

    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)
    unsubscribe1()
    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)
    unsubscribe2()
    expect(runCount).toBe(2)
    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)
  })

  it('should work with custom store', async () => {
    const store = createStore()
    const countAtom = atom(0)
    let runCount = 0

    const unsubscribe = observe((get) => {
      runCount++
      get(countAtom)
    }, store)

    expect(runCount).toBe(1)

    store.set(countAtom, (v) => v + 1)
    expect(runCount).toBe(2)

    unsubscribe()
  })

  it('should handle multiple stores independently', async () => {
    const store1 = createStore()
    const store2 = createStore()
    const countAtom = atom(0)
    const runCounts = [0, 0] as [number, number]

    const storeIdAtom = atom(NaN as 0 | 1)
    store1.set(storeIdAtom, 0)
    store2.set(storeIdAtom, 1)

    function effect(get: Getter) {
      ++runCounts[get(storeIdAtom)]
      get(countAtom)
    }

    const unsubscribe1 = observe(effect, store1)
    const unsubscribe2 = observe(effect, store2)

    expect(runCounts[0]).toBe(1)
    expect(runCounts[1]).toBe(1)

    store1.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(1)
    store2.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(2)

    unsubscribe1()
    store2.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(3)
    store2.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(4)

    unsubscribe2()
  })

  it('should handle multiple effects independently', async () => {
    const store = createStore()
    const countAtom = atom(0)
    const runCounts = [0, 0] as [number, number]

    function effect1(get: Getter) {
      ++runCounts[0]
      get(countAtom)
    }
    function effect2(get: Getter) {
      ++runCounts[1]
      get(countAtom)
    }

    const unsubscribe1 = observe(effect1, store)
    const unsubscribe2 = observe(effect2, store)

    expect(runCounts[0]).toBe(1)
    expect(runCounts[1]).toBe(1)

    store.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(2)

    unsubscribe1()
    store.set(countAtom, (v) => v + 1)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(3)

    unsubscribe2()
  })

  it('should return stable unobserve and reobserve functions', async () => {
    const store = createStore()
    const effect = () => {}
    const unobserve1 = observe(effect, store)
    const unobserve2 = observe(effect, store)
    expect(unobserve1).toBe(unobserve2)
    unobserve1()
    unobserve2()
    const unobserve5 = observe(effect, store)
    expect(unobserve5).not.toBe(unobserve1)
  })
})
