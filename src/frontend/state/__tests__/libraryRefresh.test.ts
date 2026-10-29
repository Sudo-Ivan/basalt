import { refreshRunnersProgressively } from '../libraryRefresh'
import { Runner } from 'common/types'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('refreshRunnersProgressively', () => {
  it('publishes a fast runner before a slow one resolves', async () => {
    const slow = deferred<void>()
    const published: Runner[] = []

    const result = refreshRunnersProgressively({
      runners: ['legendary', 'gog'],
      refreshRunner: (runner) =>
        runner === 'gog' ? slow.promise : Promise.resolve(),
      publish: (runner) => published.push(runner)
    })

    await Promise.resolve()
    expect(published).toEqual(['legendary'])

    slow.resolve()
    await result
    expect(published).toEqual(['legendary', 'gog'])
  })

  it('reports a rejecting runner in failed, still publishes it and does not reject', async () => {
    const published: Runner[] = []

    const result = await refreshRunnersProgressively({
      runners: ['legendary', 'gog'],
      refreshRunner: (runner) =>
        runner === 'gog'
          ? Promise.reject(new Error('down'))
          : Promise.resolve(),
      publish: (runner) => published.push(runner)
    })

    expect(result.failed).toEqual(['gog'])
    expect(published.sort()).toEqual(['gog', 'legendary'])
  })

  it('resolves only after all runners settle', async () => {
    const slow = deferred<void>()
    let resolved = false

    const result = refreshRunnersProgressively({
      runners: ['legendary', 'gog'],
      refreshRunner: (runner) =>
        runner === 'gog' ? slow.promise : Promise.resolve(),
      publish: () => undefined
    })
    void result.then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    slow.resolve()
    await result
    expect(resolved).toBe(true)
  })

  it('resolves immediately with no runners', async () => {
    const publish = jest.fn()
    const result = await refreshRunnersProgressively({
      runners: [],
      refreshRunner: () => Promise.resolve(),
      publish
    })
    expect(result.failed).toEqual([])
    expect(publish).not.toHaveBeenCalled()
  })
})
