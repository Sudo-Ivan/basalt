import { Runner } from 'common/types'

export type RefreshDeps = {
  runners: Runner[]
  refreshRunner: (runner: Runner) => Promise<unknown>
  publish: (runner: Runner) => void
}

/**
 * Refreshes each runner's library concurrently and calls publish as soon as
 * an individual runner settles, so a slow runner never delays data from a
 * fast one. Never rejects; resolves once every runner has settled with the
 * list of runners whose refresh failed.
 */
export async function refreshRunnersProgressively(
  deps: RefreshDeps
): Promise<{ failed: Runner[] }> {
  const failed: Runner[] = []
  await Promise.all(
    deps.runners.map(async (runner) => {
      try {
        await deps.refreshRunner(runner)
      } catch {
        failed.push(runner)
      } finally {
        deps.publish(runner)
      }
    })
  )
  return { failed }
}
