const inFlight = new Map<string, Promise<unknown>>()

/**
 * Deduplicates concurrent calls to the same async operation.
 * While a call for key is in flight, additional callers get the same
 * promise instead of starting fn again. Once the promise settles the
 * key is released, so a later call runs fn again.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key)
  if (running) {
    return running as Promise<T>
  }
  const promise = fn().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}
