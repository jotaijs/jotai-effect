#  Effect

## atomEffect

`atomEffect` is a utility function, allowing developers to manage side effects in their state management architecture seamlessly. It is useful for observing state changes in atoms and triggering side effects.

## Parameters

```typescript
type CleanupFn = () => void

type EffectFn = (get: Getter, set: Setter) => CleanupFn | void | Promise<CleanupFn | void>

function atomEffect(effectFn: EffectFn): Atom<void>
```

**effectFn** (required): A function or async function for listening to state updates with `get` and writing state updates with `set`. The `effectFn` is useful for creating side effects that interact with other Jotai atoms. Cleanup these side effects with the optionally returned cleanup function.

## Usage

Subscribe to Atom Changes
```jsx
import { atomEffect } from 'jotai/utils'

const loggingEffect = atomEffect((get, set) => {
  // reruns when someAtom changes
  const value = get(someAtom)
  loggingService.setValue(value)
})
```

Setup and Teardown Side Effects
```jsx
const subscriptionEffect = atomEffect((get, set) => {
  const unsubscribe = subscribe((value) => {
    set(valueAtom, value)
  })
  return unsubscribe
})
```

## Mounting with Atoms or Hooks

After defining an effect using `atomEffect`, it can be integrated within another atom's read function or passed to Jotai hooks.

```typescript
import { atom } from 'jotai'

const anAtom = atom((get) => {
  // mounts loggingEffect while anAtom is mounted
  get(loggingEffect)
  // ... other logic
})

// mounts loggingEffect while the component is mounted
useAtom(loggingEffect)
```

<Codesandbox id="85zrzn">

## Behavior

The `atomEffect` behavior during operation and interactions with other atoms is described below.

- **Cleanup Function:**
  The cleanup function is invoked on unmount or before re-evaluation.

- **Resistent To Infinite Loops:**
  `atomEffect` does not rerun when it changes a value that it is watching.

- **Asynchronous Execution:**
  `effectFn` runs asynchronously in the next available microtask, after all Jotai synchronous read evaluations have completed.

- **Batches Synchronous Updates:**
  Multiple synchronous updates to an atom that `atomEffect` is watching are batched. The effect is rerun only with the final synchronous value.

- **Conditionally Running atomEffect:**
  `atomEffect` is active only when it is mounted within the application. This prevents unnecessary computations and side effects when they are not needed.

### Dependency Management

Aside from mount events, the effect runs when any of its dependencies change value.

- **Sync:**
  All atoms accessed with `get` during the synchronous evaluation of the effect are added to the atom's internal dependency map.

  ```jsx
  const asyncEffect = atomEffect((get, set) => {
    // updates whenever `anAtom` changes value but not when `anotherAtom` changes value
    get(anAtom)
    setTimeout(() => {
      get(anotherAtom)
    }, 5000)
  })
  ```

- **Async:**
  For effects that return a promise, all atoms accessed with `get` prior to the returned promise resolving are added to the atom's internal dependency map. Atoms that have been watched after the promise has resolved, for instance in a `setTimeout`, are not included in the dependency map.

  ```jsx
  const asyncEffect = atomEffect(async (get, set) => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    // updates whenever `anAtom` changes value but not when `anotherAtom` changes value
    get(anAtom)
    setTimeout(() => {
      get(anotherAtom)
    }, 5000)
  })
  ```

- **Cleanup:**
  Accessing atoms with `get` in the cleanup function does not add them to the atom's internal dependency map.

  ```jsx
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

- **Recalculation of Dependency Map:**
  The dependency map is recalculated on every run. If an atom was not watched during the current run, it will not be in the current run's dependency map. Only actively watched atoms are considered dependencies.

  ```jsx
  const isEnabledAtom = atom(true)

  const asyncEffect = atomEffect((get, set) => {
    // if `isEnabledAtom` is true, reruns when `isEnabledAtom` or `anAtom` changes value
    // otherwise reruns when `isEnabledAtom` or `anotherAtom` changes value
    if (get(isEnabledAtom)) {
      const aValue = get(anAtom)
    } else {
      const anotherValue = get(anotherAtom)
    }
  })
  ```


