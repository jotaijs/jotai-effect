import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react'
import { atom, getDefaultStore } from 'jotai/vanilla'
import { describe, expect, it } from 'vitest'
import { atomEffect } from '../src/atomEffect'
import { assert, delay, increment, incrementLetter } from './test-utils'

const wrapper = StrictMode

it('should run the effect on mount and cleanup on unmount once', () => {
  expect.assertions(5)
  const effect = { mount: 0, unmount: 0 }

  const effectAtom = atomEffect(() => {
    effect.mount++
    return () => {
      effect.unmount++
    }
  })

  function useTest() {
    return useAtomValue(effectAtom)
  }
  const { result, rerender, unmount } = renderHook(useTest, { wrapper })
  // effect does not return a value
  expect(result.current).toBe(undefined)
  // initial render should run the effect
  expect(effect.mount).toBe(1)
  rerender()
  // rerender should not run the effect again
  expect(effect.mount).toBe(1)

  unmount()
  // unmount should run the cleanup
  expect(effect.unmount).toBe(1)

  unmount()
  // a second unmount should not run the cleanup again
  expect(effect.unmount).toBe(1)
})

it('should run the effect on mount and cleanup on unmount and whenever countAtom changes', () => {
  expect.assertions(11)
  const effect = { mount: 0, unmount: 0 }

  const countAtom = atom(0)

  const effectAtom = atomEffect((get) => {
    get(countAtom)
    effect.mount++
    return () => {
      effect.unmount++
    }
  })

  function useTest() {
    const [, setCount] = useAtom(countAtom)
    useAtomValue(effectAtom)
    return setCount
  }
  const { result, rerender, unmount } = renderHook(useTest, { wrapper })
  function incrementCount() {
    const setCount = result.current
    act(() => setCount(increment))
  }

  // initial render should run the effect but not the cleanup
  expect(effect.unmount).toBe(0)
  expect(effect.mount).toBe(1)

  rerender()
  // rerender should not run the effect again
  expect(effect.unmount).toBe(0)
  expect(effect.mount).toBe(1)

  incrementCount()

  // changing the value should run the effect again and the previous cleanup
  expect(effect.unmount).toBe(1)
  expect(effect.mount).toBe(2)

  incrementCount()

  // changing the value should run the effect again and the previous cleanup
  expect(effect.unmount).toBe(2)
  expect(effect.mount).toBe(3)

  unmount()

  // unmount should run the cleanup but not the effect again
  expect(effect.mount).toBe(3)
  expect(effect.unmount).toBe(3)

  unmount()

  // a second unmount should not run the cleanup again
  expect(effect.unmount).toBe(3)
})

it('should not cause infinite loops when effect updates the watched atom', () => {
  expect.assertions(1)
  const watchedAtom = atom(0)
  let runCount = 0
  const effectAtom = atomEffect((get, set) => {
    get(watchedAtom)
    runCount++
    set(watchedAtom, increment)
    return () => {
      set(watchedAtom, (c) => c - 1)
    }
  })
  const store = getDefaultStore()
  function useTest() {
    useAtom(effectAtom, { store })
  }
  const { rerender } = renderHook(useTest, { wrapper })

  // rerender should not run the effect again
  rerender()

  expect({ runCount, watched: store.get(watchedAtom) }).toEqual({
    runCount: 1,
    watched: 1,
  })
})

it('should not cause infinite loops when effect updates the watched atom asynchronous', async () => {
  expect.assertions(1)
  const watchedAtom = atom(0)
  let runCount = 0
  const effectAtom = atomEffect((get, set) => {
    get(watchedAtom)
    runCount++
    setTimeout(() => {
      act(() => set(watchedAtom, increment))
    }, 0)
  })
  function useTest() {
    useAtom(effectAtom)
    const setCount = useSetAtom(watchedAtom)
    return () => act(() => setCount(increment))
  }
  const { result } = renderHook(useTest, { wrapper })
  await delay(0)
  // initial render should run the effect once
  await waitFor(() => assert(runCount === 1))

  // changing the value should run the effect again one time
  await result.current()
  await delay(0)
  expect(runCount).toBe(2)
})

it('should allow synchronous infinite loops with opt-in for first run', () => {
  expect.assertions(1)
  let runCount = 0
  const watchedAtom = atom(0)
  const effectAtom = atomEffect((get, { recurse }) => {
    const value = get(watchedAtom)
    runCount++
    if (value < 5) {
      act(() => recurse(watchedAtom, increment))
    }
  })
  const store = getDefaultStore()
  function useTest() {
    useAtom(effectAtom, { store })
    const setCount = useSetAtom(watchedAtom, { store })
    return () => act(() => setCount(increment))
  }
  const { result } = renderHook(useTest, { wrapper })
  act(() => result.current())
  expect({ runCount, watched: store.get(watchedAtom) }).toEqual({
    runCount: 7, // extra run for strict mode render
    watched: 6,
  })
})
it('should conditionally run the effect and cleanup when effectAtom is unmounted', () => {
  expect.assertions(6)

  const booleanAtom = atom(false)
  let effectRunCount = 0
  let cleanupRunCount = 0

  const effectAtom = atomEffect(() => {
    effectRunCount++
    return () => {
      cleanupRunCount++
    }
  })

  const conditionalEffectAtom = atom((get) => {
    if (get(booleanAtom)) get(effectAtom)
  })

  function useTest() {
    useAtomValue(conditionalEffectAtom)
    return useSetAtom(booleanAtom)
  }

  const { result } = renderHook(useTest, { wrapper })
  const setBoolean = result.current
  const toggleBoolean = () => act(() => setBoolean((prev) => !prev))

  // Initially the effectAtom should not run as booleanAtom is false
  expect(effectRunCount).toBe(0)
  expect(cleanupRunCount).toBe(0)

  // Set booleanAtom to true, so effectAtom should run
  toggleBoolean()
  expect(effectRunCount).toBe(1)
  expect(cleanupRunCount).toBe(0)

  // Set booleanAtom to false, so effectAtom should cleanup
  toggleBoolean()
  expect(effectRunCount).toBe(1)
  expect(cleanupRunCount).toBe(1)
})

describe('should correctly process synchronous updates to the same atom', () => {
  type SetupProps = {
    effectIncrementCountBy: number
    incrementCountBy: number
  }
  function setup({ effectIncrementCountBy, incrementCountBy }: SetupProps) {
    const countAtom = atom(0)
    const runCount = { current: 0 }
    const effectAtom = atomEffect((get, set) => {
      runCount.current++
      get(countAtom)
      for (let i = 0; i < effectIncrementCountBy; i++) {
        set(countAtom, increment)
      }
    })
    function useTest() {
      useAtomValue(effectAtom)
      const [count, setCount] = useAtom(countAtom)
      const incrementCount = () => {
        for (let i = 0; i < incrementCountBy; i++) {
          setCount(increment)
        }
      }
      return { count, incrementCount }
    }
    const { result } = renderHook(useTest, { wrapper })
    return { result, runCount }
  }

  type Run = {
    runCount: number
    resultCount: number
  }

  type Solution = {
    effectIncrementCountBy: number
    incrementCountBy: number
    runs: [Run, Run]
  }

  const solutions: Solution[] = [
    {
      // 1. initial render causes effect to run: run = 1
      effectIncrementCountBy: 0,
      incrementCountBy: 0,
      runs: [
        { runCount: 1, resultCount: 0 },
        { runCount: 1, resultCount: 0 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. incrementing count: count = 1
      // 3. incrementing count reruns the effect: run = 2
      effectIncrementCountBy: 0,
      incrementCountBy: 1,
      runs: [
        { runCount: 1, resultCount: 0 },
        { runCount: 2, resultCount: 1 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. incrementing count: count = 1
      // 3. incrementing count: count = 2
      // 4. incrementing count reruns the effect (batched): run = 2
      effectIncrementCountBy: 0,
      incrementCountBy: 2,
      runs: [
        { runCount: 1, resultCount: 0 },
        { runCount: 2, resultCount: 2 },
      ],
    },
    {
      // effect should not rerun when it changes a value it is watching
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count: count = 1
      effectIncrementCountBy: 1,
      incrementCountBy: 0,
      runs: [
        { runCount: 1, resultCount: 1 },
        { runCount: 1, resultCount: 1 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count: count = 1
      // 3. incrementing count: count = 2
      // 4. incrementing count reruns the effect: run = 2
      // 5. effect increments count: count = 3
      effectIncrementCountBy: 1,
      incrementCountBy: 1,
      runs: [
        { runCount: 1, resultCount: 1 },
        { runCount: 2, resultCount: 3 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count: count = 1
      // 3. incrementing count: count = 2
      // 4. incrementing count: count = 3
      // 5. incrementing count reruns the effect (batched): run = 2
      // 6. effect increments count: count = 4
      effectIncrementCountBy: 1,
      incrementCountBy: 2,
      runs: [
        { runCount: 1, resultCount: 1 },
        { runCount: 2, resultCount: 4 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count by two: count = 2
      effectIncrementCountBy: 2,
      incrementCountBy: 0,
      runs: [
        { runCount: 1, resultCount: 2 },
        { runCount: 1, resultCount: 2 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count by two: count = 2
      // 3. incrementing count: count = 3
      // 4. incrementing count reruns the effect: run = 2
      // 5. effect increments count by two: count = 5
      effectIncrementCountBy: 2,
      incrementCountBy: 1,
      runs: [
        { runCount: 1, resultCount: 2 },
        { runCount: 2, resultCount: 5 },
      ],
    },
    {
      // 1. initial render causes effect to run: run = 1
      // 2. effect increments count by two: count = 2
      // 3. incrementing count: count = 3
      // 4. incrementing count: count = 4
      // 5. incrementing count reruns the effect (batched): run = 2
      // 6. effect increments count by two: count = 6
      effectIncrementCountBy: 2,
      incrementCountBy: 2,
      runs: [
        { runCount: 1, resultCount: 2 },
        { runCount: 2, resultCount: 6 },
      ],
    },
  ]

  it.each(solutions)(
    'should correctly process synchronous updates when effectIncrementCountBy is $effectIncrementCountBy and incrementCountBy is $incrementCountBy',
    ({ effectIncrementCountBy, incrementCountBy, runs }) => {
      expect.assertions(3)
      const { result, runCount } = setup({
        effectIncrementCountBy,
        incrementCountBy,
      })

      const [before, after] = runs

      // initial render should run the effect once
      expect(runCount.current).toBe(before.runCount)

      // perform $incrementCountBy synchronous updates
      act(() => result.current.incrementCount())

      // final value after synchronous updates and rerun of the effect
      expect(result.current.count).toBe(after.resultCount)

      expect(runCount.current).toBe(after.runCount)
    }
  )
})

it('should not batch effect setStates', () => {
  expect.assertions(4)
  const valueAtom = atom(0)
  const runCount = { current: 0 }
  const derivedAtom = atom((get) => {
    runCount.current++
    return get(valueAtom)
  })
  const triggerAtom = atom(false)
  const effectAtom = atomEffect((get, set) => {
    if (get(triggerAtom)) {
      set(valueAtom, increment)
      set(valueAtom, increment)
    }
  })
  const { result: valueResult } = renderHook(() => useAtomValue(derivedAtom), {
    wrapper,
  })
  renderHook(() => useAtomValue(effectAtom), { wrapper })
  const { result } = renderHook(() => useSetAtom(triggerAtom), { wrapper })
  const setTrigger = result.current

  waitFor(() => assert(runCount.current === 1))

  expect(valueResult.current).toBe(0)
  expect(runCount.current).toBe(1)

  act(() => setTrigger((x) => !x))
  expect(valueResult.current).toBe(2)
  expect(runCount.current).toBe(3) // <--- not batched (we would expect runCount to be 2 if batched)
})

it('should batch synchronous updates as a single transaction', () => {
  expect.assertions(4)
  const lettersAtom = atom('a')
  lettersAtom.debugLabel = 'lettersAtom'
  const numbersAtom = atom(0)
  numbersAtom.debugLabel = 'numbersAtom'
  const lettersAndNumbersAtom = atom([] as string[])
  lettersAndNumbersAtom.debugLabel = 'lettersAndNumbersAtom'
  const setLettersAndNumbersAtom = atom(null, (_get, set) => {
    set(lettersAtom, incrementLetter)
    set(numbersAtom, increment)
  })
  let runCount = 0
  const effectAtom = atomEffect((get, set) => {
    runCount++
    const letters = get(lettersAtom)
    const numbers = get(numbersAtom)
    set(lettersAndNumbersAtom, (lettersAndNumbers) => [
      ...lettersAndNumbers,
      letters + String(numbers),
    ])
  })
  function useTest() {
    useAtomValue(effectAtom)
    const lettersAndNumbers = useAtomValue(lettersAndNumbersAtom)
    const setLettersAndNumbers = useSetAtom(setLettersAndNumbersAtom)
    return { setLettersAndNumbers, lettersAndNumbers }
  }
  const { result } = renderHook(useTest, { wrapper })
  const { setLettersAndNumbers } = result.current
  expect(runCount).toBe(1)
  expect(result.current.lettersAndNumbers).toEqual(['a0'])
  act(setLettersAndNumbers)
  expect(runCount).toBe(2)
  expect(result.current.lettersAndNumbers).toEqual(['a0', 'b1'])
})

it('should run the effect once even if the effect is mounted multiple times', () => {
  expect.assertions(3)
  const lettersAtom = atom('a')
  lettersAtom.debugLabel = 'lettersAtom'
  const numbersAtom = atom(0)
  numbersAtom.debugLabel = 'numbersAtom'
  const setLettersAndNumbersAtom = atom(null, (_get, set) => {
    set(lettersAtom, incrementLetter)
    set(numbersAtom, increment)
  })
  setLettersAndNumbersAtom.debugLabel = 'setLettersAndNumbersAtom'
  let runCount = 0
  const effectAtom = atomEffect((get) => {
    runCount++
    get(lettersAtom)
    get(lettersAtom)
    get(numbersAtom)
    get(numbersAtom)
  })
  const derivedAtom = atom((get) => {
    get(effectAtom)
    get(effectAtom)
  })
  const derivedAtom2 = atom((get) => {
    get(effectAtom)
  })
  const derivedAtom3 = atom((get) => {
    get(derivedAtom2)
  })
  const derivedAtom4 = atom((get) => {
    get(derivedAtom2)
  })
  function useTest() {
    useAtomValue(effectAtom)
    useAtomValue(effectAtom)
    useAtomValue(derivedAtom)
    useAtomValue(derivedAtom)
    useAtomValue(derivedAtom2)
    useAtomValue(derivedAtom3)
    useAtomValue(derivedAtom4)
    return useSetAtom(setLettersAndNumbersAtom)
  }
  const { result } = renderHook(useTest, { wrapper })
  const setLettersAndNumbers = result.current
  expect(runCount).toBe(1)
  act(setLettersAndNumbers)
  expect(runCount).toBe(2)
  act(setLettersAndNumbers)
  expect(runCount).toBe(3)
})

it('should abort the previous promise', async () => {
  let runCount = 0
  const abortedRuns: number[] = []
  const completedRuns: number[] = []
  const resolves: (() => void)[] = []
  const countAtom = atom(0)
  const abortControllerAtom = atom<{ abortController: AbortController | null }>({
    abortController: null,
  })
  const effectAtom = atomEffect((get) => {
    const currentRun = runCount++
    get(countAtom)
    const abortControllerRef = get(abortControllerAtom)
    const abortController = new AbortController()
    const { signal } = abortController
    let aborted = false
    const abortCallback = () => {
      abortedRuns.push(currentRun)
      aborted = true
    }
    signal.addEventListener('abort', abortCallback)

    abortControllerRef.abortController = abortController
    new Promise<void>((resolve) => resolves.push(resolve)).then(() => {
      if (aborted) return
      abortControllerRef.abortController = null
      completedRuns.push(currentRun)
    })
    return () => {
      abortControllerRef.abortController?.abort()
      abortControllerRef.abortController = null
      signal.removeEventListener('abort', abortCallback)
    }
  })
  async function resolveAll() {
    resolves.forEach((resolve) => resolve())
    resolves.length = 0
  }
  function useTest() {
    useAtomValue(effectAtom)
    return useSetAtom(countAtom)
  }
  const { result } = renderHook(useTest, { wrapper })
  const setCount = result.current

  await resolveAll()
  expect(runCount).toBe(1)
  expect(abortedRuns).toEqual([])
  expect(completedRuns).toEqual([0])

  act(() => setCount(increment))
  expect(runCount).toBe(2)
  expect(abortedRuns).toEqual([])
  expect(completedRuns).toEqual([0])

  // aborted run
  act(() => setCount(increment))
  expect(runCount).toBe(3)
  expect(abortedRuns).toEqual([1])
  expect(completedRuns).toEqual([0])

  await resolveAll()
  expect(runCount).toBe(3)
  expect(abortedRuns).toEqual([1])
  expect(completedRuns).toEqual([0, 2])
})

it('should not run the effect when the effectAtom is unmounted', () => {
  const countAtom = atom(0)
  let runCount = 0
  const effectAtom = atomEffect((get) => {
    runCount++
    get(countAtom)
  })
  function useTest() {
    useAtom(effectAtom)
    return useAtom(countAtom)[1]
  }
  const { result } = renderHook(useTest, { wrapper })
  const setCount = result.current
  expect(runCount).toBe(1)
  act(() => setCount(increment))
  expect(runCount).toBe(2)
})
