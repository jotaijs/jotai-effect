# Effect

[jotai-effect](https://jotai.org/docs/extensions/effect) is a utility package for reactive side effects in Jotai.

## Install

```
npm install jotai-effect
```

## observe

`observe` mounts an `effect` to watch state changes on a Jotai `store`. It's useful for running global side effects or logic at the store level.

If you don't have access to the store object and are not using the default store, use `atomEffect` or `withAtomEffect` instead.

### Signature

```ts
type Cleanup = () => void

type Effect = (
  get: Getter & { peek: Getter }
  set: Setter & { recurse: Setter }
) => Cleanup | void

type Unobserve = () => void

function observe(effect: Effect, store?: Store): Unobserve
```

**effect:** A function for observing and reacting to atom state changes.

**store:** A Jotai store to mount the effect on. Defaults to the global store if not provided.

**returns:** A stable function that removes the effect from the store and cleans up any internal references.

### Usage

```js
import { observe } from 'jotai-effect'

const unobserve = observe((get, set) => {
  set(logAtom, `someAtom changed: ${get(someAtom)}`)
})

unobserve()
```

This allows you to run Jotai state-dependent logic outside React's lifecycle, ideal for application-wide effects.

### Usage With React

Pass the store to both `observe` and the `Provider` to ensure the effect is mounted to the correct store.

```tsx
const store = createStore()
const unobserve = observe((get, set) => {
  set(logAtom, `someAtom changed: ${get(someAtom)}`)
}, store)

<Provider store={store}>...</Provider>
```

<Stackblitz id="vitejs-vite-uk7p8i5q" file="src%2FApp.tsx" />

## atomEffect

`atomEffect` creates an atom for declaring side effects that react to state changes when mounted.

### Signature

```ts
function atomEffect(effect: Effect): Atom<void>
```

**effect:** A function for observing and reacting to atom state changes.

### Usage

```js
import { atomEffect } from 'jotai-effect'

const logEffect = atomEffect((get, set) => {
  set(logAtom, get(someAtom)) // Runs on mount or when someAtom changes
  return () => {
    set(logAtom, 'unmounting') // Cleanup on unmount
  }
})

// activates the atomEffect while Component is mounted
function Component() {
  useAtom(logEffect)
}
```

## withAtomEffect

`withAtomEffect` binds an effect to a clone of the target atom. The effect is active while the cloned atom is mounted.

### Signature

```ts
function withAtomEffect<T>(targetAtom: Atom<T>, effect: Effect): Atom<T>
```

**targetAtom:** The atom to which the effect is bound.

**effect:** A function for observing and reacting to atom state changes.

**Returns:** An atom that is equivalent to the target atom but having a bound effect.

### Usage

```js
import { withAtomEffect } from 'jotai-effect'

const valuesAtom = withAtomEffect(atom(null), (get, set) => {
  set(valuesAtom, get(countAtom))
  return () => {
    // cleanup
  }
})
```

## Dependency Management

Aside from mount events, the effect runs when any of its dependencies change value.

- **Sync:**
  All atoms accessed with `get` inside the effect are added to the atom's dependencies.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    // updates whenever `anAtom` changes value
    get(anAtom)
  })
  ```

  </details>

- **Async:**
  Asynchronous `get` calls do not add dependencies.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    setTimeout(() => {
      // does not add `anAtom` as a dependency
      get(anAtom)
    })
  })
  ```

  </details>

- **Cleanup:**
  `get` calls in cleanup do not add dependencies.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    return () => {
      // does not add `anAtom` as a dependency
      get(anAtom)
    }
  })
  ```

  </details>

- **Dependency Map Recalculation:**
  Dependencies are recalculated on every run.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    if (get(isEnabledAtom)) {
      // `isEnabledAtom` and `anAtom` are dependencies
      const aValue = get(anAtom)
    } else {
      // `isEnabledAtom` and `anotherAtom` are dependencies
      const anotherValue = get(anotherAtom)
    }
  })
  ```

  </details>


## Effect Behavior

- **Executes Synchronously:**
  `effect` runs synchronous in the current task after synchronous evaluations complete.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const logCounts = atomEffect((get, set) => {
    set(logAtom, `count is ${get(countAtom)}`)
  })
  const actionAtom = atom(null, (get, set) => {
    get(logAtom) // 'count is 0'
    set(countAtom, (value) => value + 1) // effect runs synchronously
    get(logAtom) // 'count is 1'
  })
  store.sub(logCounts, () => {})
  store.set(actionAtom)
  ```

  </details>

- **Batched Updates:**
  Multiple synchronous updates are batched as a single atomic transaction.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const tensAtom = atom(0)
  const onesAtom = atom(0)
  const updateTensAndOnes = atom(null, (get, set) => {
    set(tensAtom, (value) => value + 1)
    set(onesAtom, (value) => value + 1)
  })
  const combos = atom([])
  const effectAtom = atomEffect((get, set) => {
    const value = get(tensAtom) * 10 + get(onesAtom)
    set(combos, (arr) => [...arr, value])
  })
  store.sub(effectAtom, () => {})
  store.set(updateTensAndOnes)
  store.get(combos) // [00, 11]
  ```

  </details>

- **Resistant to Infinite Loops:**
  `atomEffect` avoids rerunning when it updates a value that it is watching.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    get(countAtom)
    set(countAtom, (value) => value + 1) // Will not loop
  })
  ```

  </details>

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

- **Idempotency:**
  `atomEffect` runs once per state change, regardless of how many times it is referenced.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  let i = 0
  const effectAtom = atomEffect(() => {
    get(countAtom)
    i++
  })
  store.sub(effectAtom, () => {})
  store.sub(effectAtom, () => {})
  store.set(countAtom, (value) => value + 1)
  console.log(i) // 1
  ```

  </details>

- **Conditionally Running Effects:**
  `atomEffect` only runs when mounted.

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

- **Supports Peek:**
  Use `get.peek` to read atom data without subscribing.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  const countAtom = atom(0)
  atomEffect((get, set) => {
    const count = get.peek(countAtom) // Will not add `countAtom` as a dependency
  })
  ```

  </details>

- **Supports Recursion:**
  Recursion is supported with `set.recurse` but not in cleanup.

  <!-- prettier-ignore -->
  <details style="cursor: pointer; user-select: none;">
    <summary>Example</summary>

  ```js
  atomEffect((get, set) => {
    const count = get(countAtom)
    if (count % 10 === 0) {
      return
    }
    set.recurse(countAtom, (value) => value + 1)
  })
  ```

  </details>
