/**
 * Maps items through async fn with at most limit calls in flight.
 * The result array preserves input order. If fn rejects, the returned
 * promise rejects.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await fn(items[index], index)
      }
    }
  )

  await Promise.all(workers)
  return results
}
