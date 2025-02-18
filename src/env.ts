export function isDev(): boolean {
  return Boolean(
    typeof process !== 'undefined' &&
      process.env?.NODE_ENV &&
      process.env.NODE_ENV !== 'production'
  )
}
