import type { Getter } from 'jotai/vanilla'
import { atom } from 'jotai/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { atomEffect } from '../src/atomEffect'
import { withAtomEffect } from '../src/withAtomEffect'
import { createDebugStore } from './test-utils'

describe('withAtomEffect', () => {
  it('ensures readonly atoms remain readonly', function test() {
    const readOnlyAtom = atom(() => 10)
    const enhancedAtom = withAtomEffect(readOnlyAtom, () => {})
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    expect(store.get(enhancedAtom)).toBe(10)
    expect(() => {
      // @ts-expect-error: should error
      store.set(enhancedAtom, 20)
    }).toThrow()
  })

  it('ensures writable atoms remain writable', function test() {
    const writableAtom = atom(0)
    const enhancedAtom = withAtomEffect(writableAtom, () => {})
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    store.set(enhancedAtom, 5)
    expect(store.get(enhancedAtom)).toBe(5)
    store.set(enhancedAtom, (prev) => prev + 1)
    expect(store.get(enhancedAtom)).toBe(6)
  })

  it('calls effect on initial use and on dependencies change of the base atom', function test() {
    const baseAtom = atom(0)
    const effectMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      effectMock()
      get(baseAtom)
    })
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(enhancedAtom, 1)
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('calls effect on initial use and on dependencies change of the enhanced atom', function test() {
    const baseAtom = atom(0)
    const effectMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      effectMock()
      get(enhancedAtom)
    })
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(enhancedAtom, 1)
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('cleans up when the atom is no longer in use', function test() {
    const cleanupMock = vi.fn()
    const baseAtom = atom(0)
    const mountMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, () => {
      mountMock()
      return () => {
        cleanupMock()
      }
    })
    const store = createDebugStore()
    const unsubscribe = store.sub(enhancedAtom, () => {})
    expect(mountMock).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(cleanupMock).toHaveBeenCalledTimes(1)
  })

  it('does not modify the original atom', function test() {
    const read = () => 0
    const baseAtom = { read }
    const enhancedAtom = withAtomEffect(baseAtom, () => {})
    expect(baseAtom.read).toBe(read)
    expect(enhancedAtom.read).not.toBe(read)
  })

  it('does not cause infinite loops when it references itself', function test() {
    const countWithEffectAtom = withAtomEffect(atom(0), (get, set) => {
      get(countWithEffectAtom)
      set(countWithEffectAtom, (v) => v + 1)
    })
    const store = createDebugStore()
    store.sub(countWithEffectAtom, () => {})
    expect(store.get(countWithEffectAtom)).toBe(1)
    store.set(countWithEffectAtom, (v) => v + 1)
    expect(store.get(countWithEffectAtom)).toBe(3)
  })

  it('can recurse', function test() {
    const base = atom(0)
    const countWithEffectAtom = withAtomEffect(base, (get, set) => {
      if (get(countWithEffectAtom) === 2) {
        return
      }
      set.recurse(countWithEffectAtom, (v) => v + 1)
    })
    const store = createDebugStore()
    store.sub(countWithEffectAtom, () => {})
    expect(store.get(countWithEffectAtom)).toBe(2)
  })

  it('can change the effect of the enhanced atom', function test() {
    const baseAtom = atom(0)
    const effectA = vi.fn((get) => {
      get(enhancedAtom)
    })
    const enhancedAtom = withAtomEffect(baseAtom, effectA)
    expect(enhancedAtom.effect).toBe(effectA)
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    effectA.mockClear()
    store.set(enhancedAtom, (v) => v + 1)
    expect(effectA).toHaveBeenCalledTimes(1)
    effectA.mockClear()
    const effectB = vi.fn((get) => get(baseAtom))
    enhancedAtom.effect = effectB
    expect(enhancedAtom.effect).toBe(effectB)
    store.set(enhancedAtom, (v) => v + 1)
    expect(effectA).not.toHaveBeenCalled()
    expect(effectB).toHaveBeenCalledTimes(1)
  })

  it('runs the cleanup function the same number of times as the effect function', function test() {
    const baseAtom = atom(0)
    const effectMock = vi.fn()
    const cleanupMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      get(enhancedAtom)
      effectMock()
      return () => {
        cleanupMock()
      }
    })
    const store = createDebugStore()
    const unsub = store.sub(enhancedAtom, () => {})
    expect(effectMock).toHaveBeenCalledTimes(1)
    expect(cleanupMock).toHaveBeenCalledTimes(0)
    store.set(enhancedAtom, 1)
    expect(effectMock).toHaveBeenCalledTimes(2)
    expect(cleanupMock).toHaveBeenCalledTimes(1)
    unsub()
    expect(effectMock).toHaveBeenCalledTimes(2)
    expect(cleanupMock).toHaveBeenCalledTimes(2)
  })

  it('runs the cleanup function the same number of times as the effect function in React', function test() {
    const baseAtom = atom(0)
    const effectMock1 = vi.fn()
    const cleanupMock1 = vi.fn()
    const effectAtom = atomEffect((get) => {
      get(baseAtom)
      effectMock1()
      return cleanupMock1
    })
    const enhancedAtom1 = atom((get) => {
      get(effectAtom)
      return get(baseAtom)
    })
    const effectMock2 = vi.fn()
    const cleanupMock2 = vi.fn()
    const enhancedAtom2 = withAtomEffect(baseAtom, (get) => {
      get(enhancedAtom2)
      effectMock2()
      return cleanupMock2
    })
    const store = createDebugStore()
    const unsub1 = store.sub(enhancedAtom1, () => {})
    const unsub2 = store.sub(enhancedAtom2, () => {})
    expect(effectMock1).toHaveBeenCalledTimes(1)
    expect(effectMock2).toHaveBeenCalledTimes(1)
    expect(cleanupMock1).toHaveBeenCalledTimes(0)
    expect(cleanupMock2).toHaveBeenCalledTimes(0)
    store.set(baseAtom, 1)
    expect(effectMock1).toHaveBeenCalledTimes(2)
    expect(effectMock2).toHaveBeenCalledTimes(2)
    expect(cleanupMock1).toHaveBeenCalledTimes(1)
    expect(cleanupMock2).toHaveBeenCalledTimes(1)
    unsub1()
    unsub2()
    expect(cleanupMock1).toHaveBeenCalledTimes(2)
    expect(cleanupMock2).toHaveBeenCalledTimes(2)
  })

  it('calculates price and discount', function test() {
    // https://github.com/pmndrs/jotai/discussions/2876
    /*
    How can be implemented an atom to hold either a value or a calculated value at the same time?

    For instance imaging the case of an order line when you have:

    - *unit price*: the price of the product, is always inserted manually.
    - *discount*: can be inserted manually or is calculated from *unit price* and *price*.
    - *price*: can be inserted manually or is calculated from *unit price* and *discount*.

    From the state:
    ```js
    state = {
      unitPrice: 100,
      discount: 0,
      price: 100
    }
    ```
    when I change the discount to 20, price gets calculated:
    ```js
    state = {
      unitPrice: 100,
      discount: 20,
      price: 80
    }
    ```
    the same state is reached if I change price to 80.

    The formula for `discount` is something like `discount = (unitPrice-price)/unitPrice*100`.
    The formula for `price` is something like `price = unitPrice*(1-discount/100)`.

    I implemented it using unitPriceAtom, discountAtom, priceAtom, discountFormulaAtom, priceFormulaAtom and atomEffect. But it results in an infinite loop.
    */

    function getNextPrice(unitPrice: number, discount: number) {
      return unitPrice * (1 - discount / 100)
    }

    function getNextDiscount(unitPrice: number, price: number) {
      return ((unitPrice - price) / unitPrice) * 100
    }

    // reacts to changes to unitPrice
    const unitPriceAtom = withAtomEffect(atom(100), (get, set) => {
      const unitPrice = get(unitPriceAtom)
      set(priceAtom, getNextPrice(unitPrice, get.peek(discountAtom)))
      set(discountAtom, getNextDiscount(unitPrice, get.peek(priceAtom)))
    })

    // reacts to changes to discount
    const discountAtom = withAtomEffect(atom(0), (get, set) => {
      const discount = get(discountAtom)
      if (discount === 20 || discount === 80) {
        const p = getNextPrice(get.peek(unitPriceAtom), discount)
        set(priceAtom, p)
      }
    })

    // reacts to changes to price
    const priceAtom = withAtomEffect(atom(100), (get, set) => {
      set(
        discountAtom,
        getNextDiscount(get.peek(unitPriceAtom), get(priceAtom))
      )
    })

    const priceAndDiscount = atom((get) => ({
      unitPrice: get(unitPriceAtom),
      discount: get(discountAtom),
      price: get(priceAtom),
    }))

    const store = createDebugStore()
    store.sub(priceAndDiscount, () => void 0)
    expect(store.get(priceAtom)).toBe(100) // value
    expect(store.get(discountAtom)).toBe(0) // (100-100)/100*100 = 0)

    store.set(discountAtom, 20)
    expect(store.get(priceAtom)).toBe(80) // 100*(1-20/100) = 80)
    expect(store.get(discountAtom)).toBe(20) // value

    store.set(priceAtom, 50)
    expect(store.get(priceAtom)).toBe(50) // value
    expect(store.get(discountAtom)).toBe(50) // (100-50)/100*100 = 50)

    store.set(unitPriceAtom, 200)
    expect(store.get(priceAtom)).toBe(100) // 200*(1-50/100) = 100)
    expect(store.get(discountAtom)).toBe(50) // (200-100)/200*100 = 50)
  })

  it('effect that reads only the base still re-runs on base change', function test() {
    const base = atom(0)
    const effectMock = vi.fn()
    const a = withAtomEffect(base, (get) => {
      // only reads base (not self), should still re-run when base changes
      get(base)
      effectMock()
    })
    const store = createDebugStore()
    store.sub(a, () => {})
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(base, (v) => v + 1)
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('should have the latest value across dependent effects (propagation)', function test() {
    const baseA = atom(0)
    const atomA = withAtomEffect(baseA, function effectA(_, set) {
      set(atomA, 1)
    })
    const baseB = atom(0)
    const atomB = withAtomEffect(baseB, function effectB(get, set) {
      const value = get(atomA)
      set(atomB, value)
    })
    const store = createDebugStore()
    store.sub(atomB, () => {})
    expect(store.get(atomA)).toBe(1)
    expect(store.get(atomB)).toBe(1)
  })

  it('does not infinite-loop when creating atoms within atoms that depend on an effect atom', function test() {
    function atomsInAtom(fn: (get: Getter) => number) {
      const data = atom((get) => {
        fn(get)
        const inner = atom(0)
        inner.onMount = (setAtom) => setAtom(1)
        return inner
      })
      return atom((get) => get(get(data)))
    }

    const atomsInAtomsAtom = atomsInAtom((get) => {
      return get(progressEffectAtom)
    })

    const progressAtom = atom(0)
    const progressEffectAtom = withAtomEffect(progressAtom, (get) => {
      get(atomsInAtomsAtom)
    })

    const store = createDebugStore()
    store.sub(progressEffectAtom, () => {})
  })

  it('should run effects with a predictable order', function test() {
    const order: string[] = []
    const base = atom(0)
    const a = withAtomEffect(base, (get) => {
      get(a)
      order.push('a')
    })
    const b = withAtomEffect(a, (get) => {
      get(b)
      order.push('b')
    })
    const c = withAtomEffect(b, (get) => {
      get(c)
      order.push('c')
    })
    const store = createDebugStore()
    store.sub(a, () => {})
    store.sub(b, () => {})
    store.sub(c, () => {})
    order.length = 0
    store.set(base, (v) => v + 1)
    expect(order.join('')).toBe('abc')
  })

  it('setting the same enhanced atom twice inside its effect runs effect once per flush', function test() {
    const base = atom(0)
    const runs: string[] = []
    const enhanced = withAtomEffect(base, (get, set) => {
      get(enhanced)
      runs.push('run')
      set(enhanced, (v: number) => v + 1)
      set(enhanced, (v: number) => v + 1)
    })
    const store = createDebugStore()
    store.sub(enhanced, () => {})
    expect(runs.length).toBe(1)
    expect(store.get(enhanced)).toBe(2)
    runs.length = 0
    store.set(enhanced, (v) => v + 1)
    expect(runs.length).toBe(1)
    expect(store.get(enhanced)).toBe(5) // +2 -> +1 -> +2
  })

  it('does not double-run effect with multiple subscribers', function test() {
    const base = atom(0)
    const runs = vi.fn()
    const enhanced = withAtomEffect(base, (get) => {
      get(enhanced)
      runs()
    })
    const store = createDebugStore()
    const u1 = store.sub(enhanced, () => {})
    const u2 = store.sub(enhanced, () => {})
    expect(runs).toHaveBeenCalledTimes(1)
    store.set(base, (v) => v + 1)
    expect(runs).toHaveBeenCalledTimes(2)
    u1()
    u2()
  })
})
