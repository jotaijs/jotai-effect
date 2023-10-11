#  Effect

You can use [jotai-effect](https://github.com/jotaijs/jotai-effect) to execute side effects and sync atoms when Jotai atom values change.

## install
```
yarn add jotai-effect
```

## atomEffect

`atomEffect` is a utility function for declaring side effects and synchronizing atoms in Jotai. It is useful for observing and reacting to state changes.

## Parameters

```ts
type CleanupFn = () => void

type EffectFn = (get: Getter, set: Setter) => CleanupFn | void | Promise<CleanupFn | void>

function atomEffect(effectFn: EffectFn): Atom<void>
```

**effectFn** (required): A function or async function for listening to state updates with `get` and writing state updates with `set`. The `effectFn` is useful for creating side effects that interact with other Jotai atoms. You can cleanup these side effects by returning a cleanup function.

## Usage

Subscribe to Atom Changes
```js
import { atomEffect } from 'jotai-effect'

const loggingEffect = atomEffect((get, set) => {
  // runs on mount or whenever someAtom changes
  const value = get(someAtom)
  loggingService.setValue(value)
})
```

Setup and Teardown Side Effects
```js
import { atomEffect } from 'jotai-effect'

const subscriptionEffect = atomEffect((get, set) => {
  const unsubscribe = subscribe((value) => {
    set(valueAtom, value)
  })
  return unsubscribe
})
```

## Mounting with Atoms or Hooks

After defining an effect using `atomEffect`, it can be integrated within another atom's read function or passed to Jotai hooks.

```js
const anAtom = atom((get) => {
  // mounts the atomEffect when anAtom mounts
  get(loggingEffect)
  // ... other logic
})

// mounts the atomEffect when the component mounts
function MyComponent() {
  useAtom(subscriptionEffect)
  ...
}
```

<Codesandbox id="85zrzn" />

## The `atomEffect` behavior

- **Cleanup Function:**
  The cleanup function is invoked on unmount or before re-evaluation.
  <details>
    <summary>Example</summary>

    ```js
    atomEffect((get, set) => {
      const intervalId = setInterval(() => set(clockAtom, Date.now()))
      return () => clearInterval(intervalId)
    })
    ```
  </details>

- **Resistent To Infinite Loops:**
  `atomEffect` does not rerun when it changes a value that it is watching.
  <details>
    <summary>Example</summary>

    ```js
    const countAtom = atom(0)
    atomEffect((get, set) => {
      // this will not infinite loop
      get(countAtom) // after mount, count will be 1
      set(countAtom, increment)
    })
    ```
  </details>

- **Executes In The Next Microtask:**
  `effectFn` runs in the next available microtask, after all Jotai synchronous read evaluations have completed.
  <details>
    <summary>Example</summary>

    ```js
    const countAtom = atom(0)
    const logAtom = atom([])
    const logCounts = atomEffect((get, set) => {
      set(logAtom, curr => [...curr, get(countAtom)])
    })
    const setCountAndReadLog = atom(null, async (get, set) => {
      get(logAtom) // [0]
      set(countAtom, increment) // effect runs in next microtask
      get(logAtom) // [0]
      await Promise.resolve().then()
      get(logAtom) // [0, 1]
    })
    store.set(setCountAndReadLog)
    ```
  </details>

- **Batches Synchronous Updates (Atomic Transactions):**
  Multiple synchronous updates to `atomEffect` atom dependencies are batched. The effect is run with the final values as a single atomic transaction.
  <details>
    <summary>Example</summary>

    ```js
    const enabledAtom = atom(false)
    const countAtom = atom(0)
    const updateLettersAndNumbers = atom(null, (get, set) => {
      set(enabledAtom, value => !value)
      set(countAtom, value => value + 1)
    })
    const combos = atom([])
    const combosEffect = atomEffect((get, set) => {
      set(combos, arr => [
        ...arr,
        [get(enabledAtom), get(countAtom)]
      ])
    })
    store.set(updateLettersAndNumbers)
    store.get(combos) // [[false, 0], [true, 1]]
    ```
  </details>

- **Conditionally Running atomEffect:**
  `atomEffect` is active only when it is mounted within the application. This prevents unnecessary computations and side effects when they are not needed. You can disable the effect by unmounting it.
  <details>
    <summary>Example</summary>

    ```js
    atom((get) => {
      if (get(isEnabledAtom)) {
        get(effectAtom)
      }
    })
    ```
  </details>

- **Idempotent:**
  `atomEffect` runs once when state changes regardless of how many times it is mounted.
  <details>
    <summary>Example</summary>

    ```js
    let i = 0
    const effectAtom = atomEffect(() => {
      get(countAtom)
      i++
    })
    const mountTwice = atom(() => {
      get(effectAtom)
      get(effectAtom)
    })
    store.set(countAtom, increment)
    Promise.resolve.then(() => {
      console.log(i) // 1
    })
    ```
  </details>

### Dependency Management

Aside from mount events, the effect runs when any of its dependencies change value.

- **Sync:**
  All atoms accessed with `get` during the synchronous evaluation of the effect are added to the atom's internal dependency map.

  <details>
    <summary>Example</summary>

    ```js
    const asyncEffect = atomEffect((get, set) => {
      // updates whenever `anAtom` changes value but not when `anotherAtom` changes value
      get(anAtom)
      setTimeout(() => {
        get(anotherAtom)
      }, 5000)
    })
    ```
  </details>

- **Async:**
  For effects that return a promise, all atoms accessed with `get` prior to the returned promise resolving are added to the atom's internal dependency map. Atoms that have been watched after the promise has resolved, for instance in a `setTimeout`, are not included in the dependency map.

  <details>
    <summary>Example</summary>

    ```js
    const asyncEffect = atomEffect(async (get, set) => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      // updates whenever `anAtom` changes value but not when `anotherAtom` changes value
      get(anAtom)
      setTimeout(() => {
        get(anotherAtom)
      }, 5000)
    })
    ```
  </details>

- **Cleanup:**
  Accessing atoms with `get` in the cleanup function does not add them to the atom's internal dependency map.

  <details>
    <summary>Example</summary>

    ```js
    const asyncEffect = atomEffect((get, set) => {
      // runs once on atom mount
      // does not update when `idAtom` changes
      const unsubscribe = subscribe((value) => {
        const id = get(idAtom)
        set(valueAtom, { id value })
      })
      return () => {
        unsubscribe(get(idAtom))
      }
    })
    ```
  </details>

- **Recalculation of Dependency Map:**
  The dependency map is recalculated on every run. If an atom was not watched during the current run, it will not be in the current run's dependency map. Only actively watched atoms are considered dependencies.

  <details>
    <summary>Example</summary>
    
    ```js
    const isEnabledAtom = atom(true)

    const asyncEffect = atomEffect((get, set) => {
      // if `isEnabledAtom` is true, runs when `isEnabledAtom` or `anAtom` changes value
      // otherwise runs when `isEnabledAtom` or `anotherAtom` changes value
      if (get(isEnabledAtom)) {
        const aValue = get(anAtom)
      } else {
        const anotherValue = get(anotherAtom)
      }
    })
    ```
  </details>


