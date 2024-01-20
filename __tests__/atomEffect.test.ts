import { useEffect } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react'
import { atom, getDefaultStore } from 'jotai/vanilla'
import { atomEffect } from '../src/atomEffect'

it('should run the effect on vanilla store', async () => {
  const store = getDefaultStore()
  const countAtom = atom(0)
  const effectAtom = atomEffect((_, set) => {
    set(countAtom, increment)
    return () => {
      set(countAtom, 0)
    }
  })
  const unsub = store.sub(effectAtom, () => void 0)
  expect(store.get(countAtom)).toBe(0)
  await waitFor(() => expect(store.get(countAtom)).toBe(1))
  unsub()
  await waitFor(() => expect(store.get(countAtom)).toBe(0))
})

it('should not call effect immediately un-subscription', async () => {
  expect.assertions(1)
  const store = getDefaultStore()
  const effect = jest.fn()
  const effectAtom = atomEffect(effect)
  const unsub = store.sub(effectAtom, () => void 0)
  unsub()
  expect(effect).not.toHaveBeenCalled()
})

it('should run the effect on mount and cleanup on unmount once', async () => {
  expect.assertions(5)
  const effect = { mount: 0, unmount: 0 }

  let hasMounted = false
  const effectAtom = atomEffect(() => {
    effect.mount++
    hasMounted = true
    return () => {
      effect.unmount++
    }
  })

  let hasRun = false
  function useTest() {
    hasRun = true
    return useAtomValue(effectAtom)
  }
  const { result, rerender, unmount } = renderHook(useTest)
  await waitFor(() => assert(hasRun && hasMounted))
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

it('should run the effect on mount and cleanup on unmount and whenever countAtom changes', async () => {
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

  let didMount = false
  function useTest() {
    const [count, setCount] = useAtom(countAtom)
    useAtomValue(effectAtom)
    useEffect(() => {
      didMount = true
    }, [count])
    return setCount
  }
  const { result, rerender, unmount } = renderHook(useTest)
  async function incrementCount() {
    const setCount = result.current
    await act(async () => setCount(increment))
  }
  await waitFor(() => assert(didMount && effect.mount === 1))

  // initial render should run the effect but not the cleanup
  expect(effect.unmount).toBe(0)
  expect(effect.mount).toBe(1)

  rerender()
  // rerender should not run the effect again
  expect(effect.unmount).toBe(0)
  expect(effect.mount).toBe(1)

  await incrementCount()

  // changing the value should run the effect again and the previous cleanup
  expect(effect.unmount).toBe(1)
  expect(effect.mount).toBe(2)

  await incrementCount()

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

it('should not cause infinite loops when effect updates the watched atom', async () => {
  expect.assertions(2)
  const watchedAtom = atom(0)
  let runCount = 0
  const effectAtom = atomEffect((get, set) => {
    get(watchedAtom)
    runCount++
    set(watchedAtom, get(watchedAtom) + 1)
  })
  function useTest() {
    useAtom(effectAtom)
    const setCount = useSetAtom(watchedAtom)
    return () => act(async () => setCount(increment))
  }
  const { result, rerender } = renderHook(useTest)

  // initial render should run the effect once
  await waitFor(() => assert(runCount === 1))

  rerender()

  // rerender should not run the effect again
  expect(runCount).toBe(1)

  // changing the value should run the effect again one time
  await result.current()
  expect(runCount).toBe(2)
})

it('should not cause infinite loops when effect updates the watched atom asynchronous', async () => {
  expect.assertions(1)
  const watchedAtom = atom(0)
  let runCount = 0
  const effectAtom = atomEffect((get, set) => {
    get(watchedAtom)
    runCount++
    setTimeout(() => {
      set(watchedAtom, get(watchedAtom) + 1)
    }, 0)
  })
  function useTest() {
    useAtom(effectAtom)
    const setCount = useSetAtom(watchedAtom)
    return () => act(async () => setCount(increment))
  }
  const { result } = renderHook(useTest)
  await delay(0)
  // initial render should run the effect once
  await waitFor(() => assert(runCount === 1))

  // changing the value should run the effect again one time
  await result.current()
  await delay(0)
  expect(runCount).toBe(2)
})

it('should conditionally run the effect and cleanup when effectAtom is unmounted', async () => {
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

  const { result } = renderHook(useTest)
  const setBoolean = result.current
  const toggleBoolean = () => act(async () => setBoolean((prev) => !prev))

  // Initially the effectAtom should not run as booleanAtom is false
  expect(effectRunCount).toBe(0)
  expect(cleanupRunCount).toBe(0)

  // Set booleanAtom to true, so effectAtom should run
  await toggleBoolean()
  expect(effectRunCount).toBe(1)
  expect(cleanupRunCount).toBe(0)

  // Set booleanAtom to false, so effectAtom should cleanup
  await toggleBoolean()
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
    const { result } = renderHook(useTest)
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
    async ({ effectIncrementCountBy, incrementCountBy, runs }) => {
      expect.assertions(3)
      const { result, runCount } = setup({
        effectIncrementCountBy,
        incrementCountBy,
      })

      const [before, after] = runs

      // initial value after $effectIncrementCountBy synchronous updates in the effect
      await waitFor(() => assert(runCount.current === before.runCount))

      // initial render should run the effect once
      expect(runCount.current).toBe(before.runCount)

      // perform $incrementCountBy synchronous updates
      await act(async () => result.current.incrementCount())

      // final value after synchronous updates and rerun of the effect
      expect(result.current.count).toBe(after.resultCount)

      expect(runCount.current).toBe(after.runCount)
    }
  )
})

it('should not batch effect setStates', async () => {
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
  const { result: valueResult } = renderHook(() => useAtomValue(derivedAtom))
  renderHook(() => useAtomValue(effectAtom))
  const { result } = renderHook(() => useSetAtom(triggerAtom))
  const setTrigger = result.current

  await waitFor(() => assert(runCount.current === 1))

  expect(valueResult.current).toBe(0)
  expect(runCount.current).toBe(1)

  await act(async () => setTrigger((x) => !x))
  expect(valueResult.current).toBe(2)
  expect(runCount.current).toBe(3) // <--- not batched (we would expect runCount to be 2 if batched)
})

it('should batch synchronous updates as a single transaction', async () => {
  expect.assertions(4)
  const lettersAtom = atom('a')
  lettersAtom.debugLabel = 'lettersAtom'
  const numbersAtom = atom(0)
  numbersAtom.debugLabel = 'numbersAtom'
  const lettersAndNumbersAtom = atom([] as string[])
  lettersAndNumbersAtom.debugLabel = 'lettersAndNumbersAtom'
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
    const setLetters = useSetAtom(lettersAtom)
    const setNumbers = useSetAtom(numbersAtom)
    const lettersAndNumbers = useAtomValue(lettersAndNumbersAtom)
    return { setLetters, setNumbers, lettersAndNumbers }
  }
  const { result } = renderHook(useTest)
  const { setLetters, setNumbers } = result.current
  await waitFor(() => assert(!!runCount))
  expect(runCount).toBe(1)
  expect(result.current.lettersAndNumbers).toEqual(['a0'])
  await act(async () => {
    setLetters(incrementLetter)
    setNumbers(increment)
  })
  expect(runCount).toBe(2)
  expect(result.current.lettersAndNumbers).toEqual(['a0', 'b1'])
})

it('should run the effect once even if the effect is mounted multiple times', async () => {
  expect.assertions(3)
  const lettersAtom = atom('a')
  lettersAtom.debugLabel = 'lettersAtom'
  const numbersAtom = atom(0)
  numbersAtom.debugLabel = 'numbersAtom'
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
    const setLetters = useSetAtom(lettersAtom)
    const setNumbers = useSetAtom(numbersAtom)
    return { setLetters, setNumbers }
  }
  const { result } = renderHook(useTest)
  const { setLetters, setNumbers } = result.current
  await waitFor(() => assert(!!runCount))
  expect(runCount).toBe(1)
  await act(async () => {
    setLetters(incrementLetter)
    setNumbers(increment)
  })
  expect(runCount).toBe(2)
  await act(async () => {
    setLetters(incrementLetter)
    setNumbers(increment)
  })
  expect(runCount).toBe(3)
})

it('should abort the previous promise', async () => {
  let runCount = 0
  const abortedRuns: number[] = []
  const completedRuns: number[] = []
  const resolves: (() => void)[] = []
  const countAtom = atom(0)
  const abortControllerAtom = atom<{ abortController: AbortController | null }>(
    {
      abortController: null,
    }
  )
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
    await delay(0)
  }
  function useTest() {
    useAtomValue(effectAtom)
    return useSetAtom(countAtom)
  }
  const { result } = renderHook(useTest)
  const setCount = result.current
  await waitFor(() => assert(!!runCount))

  await resolveAll()
  expect(runCount).toBe(1)
  expect(abortedRuns).toEqual([])
  expect(completedRuns).toEqual([0])

  await act(async () => setCount(increment))
  expect(runCount).toBe(2)
  expect(abortedRuns).toEqual([])
  expect(completedRuns).toEqual([0])

  // aborted run
  await act(async () => setCount(increment))
  expect(runCount).toBe(3)
  expect(abortedRuns).toEqual([1])
  expect(completedRuns).toEqual([0])

  await resolveAll()
  expect(runCount).toBe(3)
  expect(abortedRuns).toEqual([1])
  expect(completedRuns).toEqual([0, 2])
})

// TODO: enable this test when https://github.com/pmndrs/jotai/pull/2347 releases
it.skip('should not infinite loop with nested atomEffects', async () => {
  const metrics = {
    mounted: 0,
    runCount1: 0,
    runCount2: 0,
    unmounted: 0,
  }
  const countAtom = atom(0)
  countAtom.onMount = () => {
    ++metrics.mounted
    return () => ++metrics.unmounted
  }

  const effectAtom = atomEffect((_get, set) => {
    ++metrics.runCount1
    if (metrics.runCount1 > 1) throw new Error('infinite loop')
    Promise.resolve().then(() => {
      set(countAtom, increment)
    })
  })

  const readOnlyAtom = atom((get) => {
    get(effectAtom)
    return get(countAtom)
  })

  const effect2Atom = atomEffect((get, _set) => {
    ++metrics.runCount2
    get(readOnlyAtom)
  })

  const store = getDefaultStore()
  store.sub(effect2Atom, () => void 0)

  await waitFor(() => assert(!!metrics.runCount1))

  const atomSet = new Set(store.dev_get_mounted_atoms?.())
  expect({
    countAtom: atomSet.has(countAtom),
    effectAtom: atomSet.has(effectAtom),
    readOnlyAtom: atomSet.has(readOnlyAtom),
  }).toEqual({
    countAtom: true,
    effectAtom: true,
    readOnlyAtom: true,
  })

  expect(metrics).toEqual({
    mounted: 1,
    runCount1: 1,
    runCount2: 2,
    unmounted: 0,
  })
})

function increment(count: number) {
  return count + 1
}

function incrementLetter(str: string) {
  return String.fromCharCode(increment(str.charCodeAt(0)))
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function assert(value: boolean, message?: string): asserts value {
  if (!value) {
    throw new Error(message ?? 'assertion failed')
  }
}
