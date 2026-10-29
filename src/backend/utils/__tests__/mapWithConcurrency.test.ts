import { mapWithConcurrency } from '../mapWithConcurrency'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('mapWithConcurrency', () => {
  it('preserves input order', async () => {
    const items = [1, 2, 3, 4, 5]
    const result = await mapWithConcurrency(items, 2, async (item) => {
      await new Promise((resolve) =>
        setTimeout(resolve, (items.length - item) * 5)
      )
      return item * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
  })

  it('never exceeds the concurrency limit', async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7]
    const gates = items.map(() => deferred<number>())
    let started = 0
    let ended = 0
    let maxInFlight = 0

    const promise = mapWithConcurrency(items, 3, (item) => {
      started += 1
      maxInFlight = Math.max(maxInFlight, started - ended)
      return gates[item].promise.finally(() => {
        ended += 1
      })
    })

    // let the workers start
    await Promise.resolve()
    expect(started).toBe(3)
    expect(maxInFlight).toBe(3)

    gates.forEach((gate, index) => gate.resolve(index))
    await expect(promise).resolves.toEqual(items)
    expect(maxInFlight).toBe(3)
  })

  it('propagates the index', async () => {
    const result = await mapWithConcurrency(['a', 'b', 'c'], 2, (item, index) =>
      Promise.resolve(`${index}:${item}`)
    )
    expect(result).toEqual(['0:a', '1:b', '2:c'])
  })

  it('rejects when fn rejects', async () => {
    const promise = mapWithConcurrency([1, 2, 3], 2, (item) => {
      if (item === 2) {
        return Promise.reject(new Error('boom'))
      }
      return Promise.resolve(item)
    })
    await expect(promise).rejects.toThrow('boom')
  })

  it('resolves immediately for an empty array', async () => {
    const fn = jest.fn()
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })
})
