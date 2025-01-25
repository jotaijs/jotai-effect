#  Effect

[jotai-effect](https://jotai.org/docs/extensions/effect) is a utility package for reactive side effects.

These are utilities for declaring side effects and synchronizing atoms in Jotai. They are useful for observing and reacting to atom state changes.

## install

```
npm install jotai-effect
```

## observe

`observe` mounts an `effect` for watching state changes on the specified Jotai `store`. `observe` is useful for running global side effects or logic at the store level.

If you don't have access to the store object and are not using the default store, you should use `atomEffect` or `withAtomEffect` instead.

### Signature

```ts
type CleanupFn = () => void

type Effect = (
  get: Getter & { peek: Getter },
  set: Setter & { recurse: Setter },
) => CleanupFn | void

type Unobserve = () => Reobserve
type Reobserve = () => Unobserve

function observe(effect: Effect, store?: Store): Unobserve
```

**effect** (required): A function for listening to state updates with `get` and writing state updates with `set`. The `effect` is useful for creating side effects that interact with other Jotai atoms. You can cleanup these side effects by returning a cleanup function.

**store** (optional): A Jotai store to mount the effect on. Defaults to the global store if not provided.  

**returns**: An `unobserve` function that, when called, removes the effect from the store and cleans up any internal references. `unobserve` returns a `reobserve` function that can be used to reattach the effect to the store.

### Usage

```js
import { observe } from 'jotai-effect'

// Mount the effect using the default store
const unobserve = observe((get, set) => {
  set(logAtom, 'someAtom changed:', get(someAtom))
})
...
// Clean it up later
const reobserve = unobserve()

// Reattach the effect to the store
const unobserveAgain = reobserve()
```

This allows you to run Jotai state-dependent logic outside the typical React lifecycle, which can be convenient for application-wide or one-off effects.

## atomEffect

`atomEffect` is an atom creator for declaring side effects and synchronizing atoms in Jotai. It is useful for observing and reacting to state changes when the atomEffect is mounted.

### Signature

```ts
function atomEffect(effect: Effect): Atom<void>
```

**effect** (required): A function for listening to state updates with `get` and writing state updates with `set`.

### Usage

Subscribe to Atom Changes

```js
import { atomEffect } from 'jotai-effect'

const logEffect = atomEffect((get, set) => {
  // runs on mount or whenever someAtom changes
  set(logAtom, get(someAtom))

  return () => {
    // unmount is called when the Component unmounts
    set(logAtom, 'unmounting')
  }
})

// mounts to activate the atomEffect when Component mounts
function Component() {
  useAtom(logEffect)
  // ...
}
```

### Mounting with Atoms or Hooks

After defining an effect using `atomEffect`, it can be integrated within another atom's read function or passed to Jotai hooks.

```js
const anAtom = atom((get) => {
  // mounts the atomEffect when anAtom mounts
  get(logEffect)
})

// mounts to activate the atomEffect when MyComponent mounts
function MyComponent() {
  useAtom(logEffect)
  // ...
}
```

<CodeSandbox id="tg9xsf" />

## withAtomEffect

`withAtomEffect` binds an effect to a clone of the target atom. This is useful for creating effects that are active when the clone of the target atom is mounted.

### Signature

```ts
function withAtomEffect<T>(
  targetAtom: Atom<T>,
  effect: Effect,
): Atom<T>
```

**targetAtom** (required): The atom to which the effect is bound.

**effect** (required): A function for listening to state updates with `get` and writing state updates with `set`.

**Returns:** An atom that is equivalent to the target atom but having a bound effect.

### Usage

```js
import { withAtomEffect } from 'jotai-effect'

const valuesAtom = withAtomEffect(atom(null), (get, set) => {
  // runs when valuesAtom is mounted
  set(valuesAtom, get(countAtom))
  return unsubscribe
})
```

## The `Effect` behavior

- **Cleanup Function:**
  The cleanup function is invoked on unmount or before re-evaluation.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    const intervalId = setInterval(() => set(clockAtom, Date.now()))
    return () => clearInterval(intervalId)
  })
  ```

  </details>

- **Resistant To Infinite Loops:**
  `atomEffect` does not rerun when it changes a value with `set` that it is watching.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
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

- **Supports Recursion:**
  Recursion is supported with `set.recurse` for both sync and async use cases, but is not supported in the cleanup function.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const countAtom = atom(0)
  atomEffect((get, set) => {
    // increments count once per second
    const count = get(countAtom)
    const timeoutId = setTimeout(() => {
      set.recurse(countAtom, increment)
    }, 1000)
    return () => clearTimeout(timeoutId)
  })
  ```

  </details>

- **Supports Peek:**
  Read atom data without subscribing to changes with `get.peek`.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const countAtom = atom(0)
  atomEffect((get, set) => {
    // will not rerun when countAtom changes
    const count = get.peek(countAtom)
  })
  ```

  </details>

- **Executes In The Next Microtask:**
  `effect` runs in the next available microtask, after all Jotai synchronous read evaluations have completed.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const countAtom = atom(0)
  const logAtom = atom([])
  const logCounts = atomEffect((get, set) => {
    set(logAtom, (curr) => [...curr, get(countAtom)])
  })
  const setCountAndReadLog = atom(null, async (get, set) => {
    get(logAtom) // [0]
    set(countAtom, increment) // effect runs in next microtask
    get(logAtom) // [0]
    await Promise.resolve()
    get(logAtom) // [0, 1]
  })
  store.set(setCountAndReadLog)
  ```

  </details>

- **Batches Synchronous Updates (Atomic Transactions):**
  Multiple synchronous updates to `atomEffect` atom dependencies are batched. The effect is run with the final values as a single atomic transaction.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const countTensAtom = atom(0)
  const countOnesAtom = atom(0)
  const updateTensAndOnes = atom(null, (get, set) => {
    set(countTensAtom, (value) => value + 1)
    set(countOnesAtom, (value) => value + 1)
  })
  const combos = atom([])
  const combosEffect = atomEffect((get, set) => {
    const value = get(countTensAtom) * 10 + get(countOnesAtom)
    set(combos, (arr) => [...arr, value])
  })
  store.set(updateTensAndOnes)
  store.get(combos) // [00, 11]
  ```

  </details>

- **Conditionally Running atomEffect:**
  `atomEffect` is active only when it is mounted within the application. This prevents unnecessary computations and side effects when they are not needed. You can disable the effect by unmounting it.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
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

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
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

## Dependency Management

Aside from mount events, the effect runs when any of its dependencies change value.

- **Sync:**
  All atoms accessed with `get` during the synchronous evaluation of the effect are added to the atom's internal dependency map.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    // updates whenever `anAtom` changes value but not when `anotherAtom` changes value
    get(anAtom)
    setTimeout(() => {
      get(anotherAtom)
    }, 5000)
  })
  ```

  </details>

- **Async:**
  For async effects, you should use an abort controller to cancel pending fetch requests and promises.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    const count = get(countAtom) // countAtom is an atom dependency
    const abortController = new AbortController()
    ;(async () => {
      try {
        await delay(1000)
        abortController.signal.throwIfAborted()
        get(dataAtom) // dataAtom is not an atom dependency
      } catch (e) {
        if (e instanceof AbortError) {
          // async cleanup logic here
        } else {
          console.error(e)
        }
      }
    })()
    return () => {
      // abort when countAtom changes
      abortController.abort(new AbortError())
    }
  })
  ```

  </details>

- **Cleanup:**
  Accessing atoms with `get` in the cleanup function does not add them to the atom's internal dependency map.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    // runs once on mount
    // does not update when `idAtom` changes
    set(logAtom, get(valueAtom))
    return () => {
      get(idAtom)
    }
  })
  ```

  </details>

- **Recalculation of Dependency Map:**
  The dependency map is recalculated on every run. If an atom was not watched during the current run, it will not be in the current run's dependency map. Only actively watched atoms are considered dependencies.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const isEnabledAtom = atom(true)

  atomEffect((get, set) => {
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

## Comparison with useEffect

### Component Side Effects

[useEffect](https://react.dev/reference/react/useEffect) is a React Hook that lets you synchronize a component with an external system.

Hooks are functions that let you “hook into” React state and lifecycle features from function components.
They are a way to reuse, but not centralize, stateful logic.
Each call to a hook has a completely isolated state.
This isolation can be referred to as _component-scoped_.
For synchronizing component props and state with a Jotai atom, you should use the useEffect hook.

### Global Side Effects

For setting up global side-effects, deciding between useEffect and atomEffect comes down to developer preference.
Whether you prefer to build this logic directly into the component or build this logic into the Jotai state model depends on what mental model you adopt.

atomEffects are more appropriate for modeling behavior in atoms.
They are scoped to the store context rather than the component.
This guarantees that a single effect will be used regardless of how many calls they have.

The same guarantee can be achieved with the useEffect hook if you ensure that the useEffect is idempotent.

atomEffects are distinguished from useEffect in a few other ways. They can directly react to atom state changes, are resistent to infinite loops, and can be mounted conditionally.

### It's up to you

Both useEffect and atomEffect have their own advantages and applications. Your project’s specific needs and your comfort level should guide your selection.
Always lean towards an approach that gives you a smoother, more intuitive development experience. Happy coding!
