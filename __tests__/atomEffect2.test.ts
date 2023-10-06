import { useEffect } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'
import assert from 'minimalistic-assert'
import { atomEffect } from '../src/atomEffect2'
import { defer, toggle } from '../src/utils'

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
  const render = { mount: 0, unmount: 0 }
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
    const [count, setCount] = useAtom(countAtom)
    useAtomValue(effectAtom)
    useEffect(() => {
      render.mount++
      return () => {
        render.unmount++
      }
    }, [count])
    return setCount
  }
  const { result, rerender, unmount } = renderHook(useTest)
  async function incrementCount() {
    const setCount = result.current
    await act(async () => setCount(increment))
  }
  await waitFor(() => assert(render.mount === 1 && effect.mount === 1))

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

it('should allow asynchronous `get` and `set` in the effect', async () => {
  expect.assertions(5)
  const valueAtom = atom(0)
  let runCount = 0

  const effectAtom = atomEffect(async (get, set) => {
    runCount++
    await act(async () => {
      await defer()
      const value = get(valueAtom)
      if (runCount === 1) {
        expect(value).toBe(0)
      } else if (runCount === 2) {
        expect(value).toBe(2)
      } else {
        throw new Error('effect ran too many times')
      }
      set(valueAtom, increment)
    })
  })

  function useTest() {
    useAtomValue(effectAtom)
    return useAtom(valueAtom)
  }
  const { result } = renderHook(useTest)
  const [, setCount] = result.current

  // initial render should run the effect
  await waitFor(() => assert(result.current[0] === 1))
  expect(runCount).toBe(1)

  // changing the value should run the effect again
  await act(async () => setCount(increment))
  expect(runCount).toBe(2)
  expect(result.current[0]).toBe(3)
})

it('should allow asynchronous `get` and `set` in the effect cleanup', async () => {
  expect.assertions(5)

  const valueAtom = atom(0)
  const cleanupValueAtom = atom(0)
  let runCount = 0
  let cleanupRunCount = 0

  const effectAtom = atomEffect(async (get, set) => {
    runCount++
    get(valueAtom)
    return async () => {
      cleanupRunCount++
      await defer()
      const cleanupValue = get(cleanupValueAtom)
      if (cleanupRunCount === 1) {
        expect(cleanupValue).toBe(0)
      } else if (cleanupRunCount === 2) {
        expect(cleanupValue).toBe(2)
      } else {
        throw new Error('cleanup ran too many times')
      }
      set(cleanupValueAtom, increment)
    }
  })

  function useTest() {
    useAtomValue(effectAtom)
    const [value, setValue] = useAtom(valueAtom)
    const setCleanupValue = useSetAtom(cleanupValueAtom)
    return { value, setValue, setCleanupValue }
  }

  const { result, unmount } = renderHook(useTest)
  const { setValue, setCleanupValue } = result.current

  await waitFor(() => assert(runCount === 1))

  // changing the value should trigger the cleanup again
  await act(async () => setValue(increment))

  expect(cleanupRunCount).toBe(1)
  // changing the cleanupValue does not cause effect to rerun
  // this is because effect dependencies are only those that are read in the effect
  await act(async () => setCleanupValue(increment))
  expect(cleanupRunCount).toBe(1)

  // unmounting should trigger the cleanup
  unmount()
  expect(cleanupRunCount).toBe(2)
})

it('should conditionally run the effect and cleanup when effectAtom is unmounted', async () => {
  expect.assertions(6)

  const booleanAtom = atom(false)
  let effectRunCount = 0
  let cleanupRunCount = 0

  const effectAtom = atomEffect(async () => {
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
  const effectAtom = atomEffect(async (get, set) => {
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

  await act(async () => setTrigger(toggle))
  expect(valueResult.current).toBe(2)
  expect(runCount.current).toBe(3) // <--- not batched (we would expect runCount to be 2 if batched)
})

function increment(count: number) {
  return count + 1
}
