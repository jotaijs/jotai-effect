import { act, renderHook } from '@testing-library/react'
import { useAtomValue } from 'jotai/react'
import { Getter, atom } from 'jotai/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { atomEffect } from '../src/atomEffect'
import { withAtomEffect } from '../src/withAtomEffect'
import { createDebugStore } from './test-utils'

describe('withAtomEffect', () => {
  it('ensures readonly atoms remain readonly', () => {
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

  it('ensures writable atoms remain writable', () => {
    const writableAtom = atom(0)
    const enhancedAtom = withAtomEffect(writableAtom, () => {})
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    store.set(enhancedAtom, 5)
    expect(store.get(enhancedAtom)).toBe(5)
    store.set(enhancedAtom, (prev) => prev + 1)
    expect(store.get(enhancedAtom)).toBe(6)
  })

  it('calls effect on initial use and on dependencies change of the base atom', async () => {
    const baseAtom = atom(0)
    const effectMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      effectMock()
      get(baseAtom)
    })
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(enhancedAtom, 1)
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('calls effect on initial use and on dependencies change of the enhanced atom', async () => {
    const baseAtom = atom(0)
    const effectMock = vi.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      effectMock()
      get(enhancedAtom)
    })
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(enhancedAtom, 1)
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('cleans up when the atom is no longer in use', async () => {
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
    await Promise.resolve()
    expect(mountMock).toHaveBeenCalledTimes(1)
    unsubscribe()
    await Promise.resolve()
    expect(cleanupMock).toHaveBeenCalledTimes(1)
  })

  it('does not modify the original atom', () => {
    const read = () => 0
    const baseAtom = { read }
    const enhancedAtom = withAtomEffect(baseAtom, () => {})
    expect(baseAtom.read).toBe(read)
    expect(enhancedAtom.read).not.toBe(read)
  })

  it('does not cause infinite loops when it references itself', async () => {
    const countWithEffectAtom = withAtomEffect(atom(0), (get, set) => {
      get(countWithEffectAtom)
      set(countWithEffectAtom, (v) => v + 1)
    })
    const store = createDebugStore()
    store.sub(countWithEffectAtom, () => {})
    await Promise.resolve()
    expect(store.get(countWithEffectAtom)).toBe(1)
    store.set(countWithEffectAtom, (v) => ++v)
    await Promise.resolve()
    expect(store.get(countWithEffectAtom)).toBe(3)
  })

  it('can change the effect of the enhanced atom', async () => {
    const baseAtom = atom(0)
    const effectA = vi.fn((get) => {
      get(enhancedAtom)
    })
    const enhancedAtom = withAtomEffect(baseAtom, effectA)
    expect(enhancedAtom.effect).toBe(effectA)
    const store = createDebugStore()
    store.sub(enhancedAtom, () => {})
    await Promise.resolve()
    effectA.mockClear()
    store.set(enhancedAtom, (v) => ++v)
    await Promise.resolve()
    expect(effectA).toHaveBeenCalledTimes(1)
    effectA.mockClear()
    const effectB = vi.fn((get) => get(baseAtom))
    enhancedAtom.effect = effectB
    expect(enhancedAtom.effect).toBe(effectB)
    store.set(enhancedAtom, (v) => ++v)
    await Promise.resolve()
    expect(effectA).not.toHaveBeenCalled()
    expect(effectB).toHaveBeenCalledTimes(1)
  })

  it('runs the cleanup function the same number of times as the effect function', async () => {
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
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(1)
    expect(cleanupMock).toHaveBeenCalledTimes(0)
    store.set(enhancedAtom, 1)
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(2)
    expect(cleanupMock).toHaveBeenCalledTimes(1)
    unsub()
    await Promise.resolve()
    expect(effectMock).toHaveBeenCalledTimes(2)
    expect(cleanupMock).toHaveBeenCalledTimes(2)
  })

  it('runs the cleanup function the same number of times as the effect function in React', async () => {
    const baseAtom = atom(0)
    const effectMock1 = vi.fn()
    const cleanupMock1 = vi.fn()
    const effectAtom = atomEffect((get) => {
      get(baseAtom)
      effectMock1()
      return () => {
        cleanupMock1()
      }
    })
    const enhancedAtom1 = atom(
      (get) => {
        get(effectAtom)
        return get(baseAtom)
      },
      (_, set, value: number) => set(baseAtom, value)
    )
    const effectMock2 = vi.fn()
    const cleanupMock2 = vi.fn()
    const enhancedAtom2 = withAtomEffect(baseAtom, (get) => {
      get(enhancedAtom2)
      effectMock2()
      return cleanupMock2
    })
    const store = createDebugStore()
    function Test() {
      useAtomValue(enhancedAtom1, { store })
      useAtomValue(enhancedAtom2, { store })
    }
    const { unmount } = renderHook(Test)
    expect(effectMock1).toHaveBeenCalledTimes(1)
    expect(effectMock2).toHaveBeenCalledTimes(1)
    expect(cleanupMock1).toHaveBeenCalledTimes(0)
    expect(cleanupMock2).toHaveBeenCalledTimes(0)
    act(() => store.set(baseAtom, 1))
    expect(effectMock1).toHaveBeenCalledTimes(2)
    expect(effectMock2).toHaveBeenCalledTimes(2)
    expect(cleanupMock1).toHaveBeenCalledTimes(1)
    expect(cleanupMock2).toHaveBeenCalledTimes(1)
    act(unmount)
    expect(cleanupMock1).toHaveBeenCalledTimes(2)
    expect(cleanupMock2).toHaveBeenCalledTimes(2)
  })

  it('calculates price and discount', async () => {
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

  it('should have the latest value from atomA', function test() {
    const atomA = withAtomEffect(atom(0), function effectA(_, set) {
      set(atomA, 1)
    })
    const atomB = withAtomEffect(atom(0), function effectB(get, set) {
      const value = get(atomA)
      set(atomB, value)
    })
    const store = createDebugStore()
    store.sub(atomB, () => {})
    expect(store.get(atomB)).toBe(1)
  })

  it('should not cause infinite loops when depending on atoms in atoms', async () => {
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
    await Promise.resolve()
  })
})
