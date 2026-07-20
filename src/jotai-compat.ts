import * as jt from 'jotai/vanilla/internals'

export type * from 'jotai/vanilla/internals'
export {
  INTERNAL_addPendingPromiseToDependency,
  INTERNAL_getMountedOrPendingDependents,
  INTERNAL_hasInitialValue,
  INTERNAL_isActuallyWritableAtom,
  INTERNAL_isAtomStateInitialized,
  INTERNAL_isPromiseLike,
  INTERNAL_returnAtomValue,
} from 'jotai/vanilla/internals'

const REV_PREFIX = 'INTERNAL_getBuildingBlocksRev'

const revision = Number(
  Object.keys(jt)
    .find((key) => key.startsWith(REV_PREFIX))
    ?.slice(REV_PREFIX.length)
)

if (Number.isNaN(revision)) {
  throw new Error('jotai-compat: unsupported jotai internals revision')
}

const api = jt as Record<string, unknown>

type Store = jt.INTERNAL_Store
type BuildingBlocks = jt.INTERNAL_BuildingBlocks
type StoreHooks = jt.INTERNAL_StoreHooks

type GetBuildingBlocks = (store: Store) => BuildingBlocks
type InitHooks = (hooks: StoreHooks) => Required<StoreHooks>
type BuildStoreRawV2 = (...buildingBlocks: unknown[]) => Store
type BuildStoreRawV3 = (buildingBlocks?: Record<string, unknown>) => Store
type ThrowSync = (error: unknown) => boolean

const getBBKey = `INTERNAL_getBuildingBlocksRev${revision}`
const initHooksKey = `INTERNAL_initializeStoreHooksRev${revision}`
const buildStoreKey = `INTERNAL_buildStoreRev${revision}`
const throwSyncKey = 'INTERNAL_shouldThrowSynchronously'

export const INTERNAL_initializeStoreHooks = api[initHooksKey] as InitHooks

const buildStoreRaw = api[buildStoreKey] as BuildStoreRawV2 | BuildStoreRawV3

export function INTERNAL_buildStore(
  buildingBlocks?: unknown[] | Record<string, unknown>
): Store {
  if (revision < 4) {
    const buildingBlocksArray = buildingBlocks
      ? Object.values(buildingBlocks)
      : []
    return (buildStoreRaw as BuildStoreRawV2)(...buildingBlocksArray)
  }
  const buildingBlocksObject = Array.isArray(buildingBlocks)
    ? Object.fromEntries(slots.map(([_, c], i) => [c, buildingBlocks[i]]))
    : buildingBlocks
  return (buildStoreRaw as BuildStoreRawV3)(buildingBlocksObject)
}

export const INTERNAL_shouldThrowSynchronously = api[throwSyncKey] as ThrowSync

const slots = [
  ['atomStateMap', 'a'],
  ['mountedMap', 'm'],
  ['invalidatedAtoms', 'i'],
  ['changedAtoms', 'c'],
  ['mountCallbacks', 'q'],
  ['unmountCallbacks', 'Q'],
  ['storeHooks', 'h'],
  ['atomRead', 'R'],
  ['atomWrite', 'W'],
  ['atomOnInit', 'I'],
  ['atomOnMount', 'M'],
  ['ensureAtomState', 'e'],
  ['flushCallbacks', 'f'],
  ['recomputeInvalidatedAtoms', 'C'],
  ['readAtomState', 'r'],
  ['invalidateDependents', 'd'],
  ['writeAtomState', 'w'],
  ['mountDependencies', 'D'],
  ['mountAtom', 't'],
  ['unmountAtom', 'T'],
  ['setAtomStateValueOrPromise', 'v'],
  ['storeGet', 'g'],
  ['storeSet', 's'],
  ['storeSub', 'b'],
  ['enhanceBuildingBlocks', 'B'],
  ['abortHandlersMap', 'p'],
  ['registerAbortHandler', 'H'],
  ['abortPromise', 'A'],
  ['storeEpochHolder', 'E'],
] as const

if (revision >= 4) {
  for (const [name, char] of slots) {
    if (api[`INTERNAL_KEY_${name}`] !== char) {
      throw new Error(`jotai-compat: KEY drift for ${name}`)
    }
  }
}

type SlotKeys<S extends readonly (readonly [string, string])[]> = {
  -readonly [I in keyof S as I extends `${number}`
    ? `INTERNAL_KEY_${S[I][0]}`
    : never]: I extends `${infer N extends number}`
    ? S[I][1] extends keyof BuildingBlocks
      ? S[I][1]
      : N
    : never
}

const K = {} as SlotKeys<typeof slots>
slots.forEach(([name, c], i) => {
  K[`INTERNAL_KEY_${name}`] = (revision >= 4 ? c : i) as never
})

export const {
  INTERNAL_KEY_atomStateMap,
  INTERNAL_KEY_mountedMap,
  INTERNAL_KEY_invalidatedAtoms,
  INTERNAL_KEY_changedAtoms,
  INTERNAL_KEY_mountCallbacks,
  INTERNAL_KEY_unmountCallbacks,
  INTERNAL_KEY_storeHooks,
  INTERNAL_KEY_atomRead,
  INTERNAL_KEY_atomWrite,
  INTERNAL_KEY_atomOnInit,
  INTERNAL_KEY_atomOnMount,
  INTERNAL_KEY_ensureAtomState,
  INTERNAL_KEY_flushCallbacks,
  INTERNAL_KEY_recomputeInvalidatedAtoms,
  INTERNAL_KEY_readAtomState,
  INTERNAL_KEY_invalidateDependents,
  INTERNAL_KEY_writeAtomState,
  INTERNAL_KEY_mountDependencies,
  INTERNAL_KEY_mountAtom,
  INTERNAL_KEY_unmountAtom,
  INTERNAL_KEY_setAtomStateValueOrPromise,
  INTERNAL_KEY_storeGet,
  INTERNAL_KEY_storeSet,
  INTERNAL_KEY_storeSub,
  INTERNAL_KEY_enhanceBuildingBlocks,
  INTERNAL_KEY_abortHandlersMap,
  INTERNAL_KEY_registerAbortHandler,
  INTERNAL_KEY_abortPromise,
  INTERNAL_KEY_storeEpochHolder,
} = K

const rawGetBuildingBlocks = api[getBBKey] as GetBuildingBlocks

const processed = new WeakMap<Record<string, unknown>, BuildingBlocks>()

export const INTERNAL_getBuildingBlocks = (store: Store): BuildingBlocks => {
  const raw = rawGetBuildingBlocks(store) as unknown as Record<string, unknown>
  let buildingBlocks = processed.get(raw)
  if (!buildingBlocks) {
    buildingBlocks = (Array.isArray(raw) ? [] : {}) as BuildingBlocks
    slots.forEach(([_, c], i) => {
      const value = Object.prototype.hasOwnProperty.call(raw, c)
        ? raw[c]
        : raw[i]
      const attributes = { value, enumerable: true }
      Object.defineProperty(buildingBlocks, i, attributes)
      Object.defineProperty(buildingBlocks, c, attributes)
    })
    processed.set(raw, buildingBlocks)
  }
  return buildingBlocks as BuildingBlocks
}
