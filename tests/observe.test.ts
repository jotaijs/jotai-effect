import { Getter, atom, createStore, getDefaultStore } from 'jotai/vanilla'
import { describe, expect, it } from 'vitest'
import { observe } from '../src/observe'
import { delay, increment } from './test-utils'

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

    await delay(0)
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

    await delay(0)
    expect(runCount).toBe(1)

    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(2)
    unsubscribe1()
    unsubscribe2()
    store.set(countAtom, increment)
    await delay(0)
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

    await delay(0)
    expect(runCount).toBe(1)

    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(2)
    unsubscribe1()
    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(2)
    unsubscribe2()
    expect(runCount).toBe(2)
    store.set(countAtom, increment)
    await delay(0)
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

    await delay(0)
    expect(runCount).toBe(1)

    store.set(countAtom, increment)
    await delay(0)
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

    await delay(0)
    expect(runCounts[0]).toBe(1)
    expect(runCounts[1]).toBe(1)

    store1.set(countAtom, increment)
    await delay(0)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(1)
    store2.set(countAtom, increment)
    await delay(0)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(2)

    unsubscribe1()
    store2.set(countAtom, increment)
    await delay(0)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(3)
    store2.set(countAtom, increment)
    await delay(0)
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

    await delay(0)
    expect(runCounts[0]).toBe(1)
    expect(runCounts[1]).toBe(1)

    store.set(countAtom, increment)
    await delay(0)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(2)

    unsubscribe1()
    store.set(countAtom, increment)
    await delay(0)
    expect(runCounts[0]).toBe(2)
    expect(runCounts[1]).toBe(3)

    unsubscribe2()
  })

  it('should allow reobserving', async () => {
    const store = createStore()
    const countAtom = atom(0)
    let runCount = 0
    function effect(get: Getter) {
      ++runCount
      get(countAtom)
    }
    const unobserve = observe(effect, store)
    await delay(0)
    expect(runCount).toBe(1)
    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(2)
    const reobserve = unobserve()
    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(2)
    reobserve()
    store.set(countAtom, increment)
    await delay(0)
    expect(runCount).toBe(3)
  })

  it('should return stable unobserve and reobserve functions', async () => {
    const store = createStore()
    const effect = () => {}
    const unobserve1 = observe(effect, store)
    const unobserve2 = observe(effect, store)
    expect(unobserve1).toBe(unobserve2)
    const reobserve1 = unobserve1()
    const reobserve2 = unobserve2()
    expect(reobserve1).toBe(reobserve2)
    const unobserve3 = reobserve1()
    const unobserve4 = reobserve2()
    expect(unobserve3).not.toBe(unobserve1)
    expect(unobserve3).toBe(unobserve4)
    const reobserve3 = unobserve3()
    const reobserve4 = unobserve4()
    expect(reobserve3).not.toBe(reobserve1)
    expect(reobserve3).toBe(reobserve4)
    const unobserve5 = observe(effect, store)
    expect(unobserve5).not.toBe(unobserve1)
  })
})
