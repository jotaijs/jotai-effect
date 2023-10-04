import type { PromiseOrValue } from './types'

/**
 * delays execution until next microtask
 */
export function defer(fn?: () => PromiseOrValue<void>) {
  return Promise.resolve().then(fn)
}

export function toggle(value: boolean) {
  return !value
}
