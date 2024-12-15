import { atom, createStore } from 'jotai/vanilla'
import { withAtomEffect } from '../src/withAtomEffect'
import { delay } from './test-utils'

describe('withAtomEffect', () => {
  it('ensures readonly atoms remain readonly', () => {
    const readOnlyAtom = atom(() => 10)
    const enhancedAtom = withAtomEffect(readOnlyAtom, () => {})
    const store = createStore()
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
    const store = createStore()
    store.sub(enhancedAtom, () => {})
    store.set(enhancedAtom, 5)
    expect(store.get(enhancedAtom)).toBe(5)
    store.set(enhancedAtom, (prev) => prev + 1)
    expect(store.get(enhancedAtom)).toBe(6)
  })

  it('calls effect on initial use and on dependencies change', async () => {
    const baseAtom = atom(0)
    const effectMock = jest.fn()
    const enhancedAtom = withAtomEffect(baseAtom, (get) => {
      effectMock()
      get(baseAtom)
    })
    const store = createStore()
    store.sub(enhancedAtom, () => {})
    await delay(0)
    expect(effectMock).toHaveBeenCalledTimes(1)
    store.set(baseAtom, 1)
    await delay(0)
    expect(effectMock).toHaveBeenCalledTimes(2)
  })

  it('cleans up when the atom is no longer in use', async () => {
    const cleanupMock = jest.fn()
    const baseAtom = atom(0)
    const mountMock = jest.fn()
    const enhancedAtom = withAtomEffect(baseAtom, () => {
      mountMock()
      return () => {
        cleanupMock()
      }
    })
    const store = createStore()
    const unsubscribe = store.sub(enhancedAtom, () => {})
    await delay(0)
    expect(mountMock).toHaveBeenCalledTimes(1)
    unsubscribe()
    await delay(0)
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
    const store = createStore()
    store.sub(countWithEffectAtom, () => {})
    await Promise.resolve()
    expect(store.get(countWithEffectAtom)).toBe(1)
    store.set(countWithEffectAtom, (v) => ++v)
    await Promise.resolve()
    expect(store.get(countWithEffectAtom)).toBe(3)
  })
})
