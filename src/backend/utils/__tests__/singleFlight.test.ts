import { singleFlight } from '../singleFlight'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('singleFlight', () => {
  it('shares one in-flight execution between concurrent callers', async () => {
    const gate = deferred<string>()
    const fn = jest.fn(() => gate.promise)

    const first = singleFlight('key', fn)
    const second = singleFlight('key', fn)

    expect(fn).toHaveBeenCalledTimes(1)
    gate.resolve('result')
    await expect(first).resolves.toBe('result')
    await expect(second).resolves.toBe('result')
  })

  it('clears the key after resolve so a later call runs again', async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('one')
      .mockResolvedValueOnce('two')

    await expect(singleFlight('key', fn)).resolves.toBe('one')
    await expect(singleFlight('key', fn)).resolves.toBe('two')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears the key after reject so a later call runs again', async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('recovered')

    await expect(singleFlight('key', fn)).rejects.toThrow('fail')
    await expect(singleFlight('key', fn)).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('shares the rejection with concurrent callers', async () => {
    const gate = deferred<string>()
    const fn = jest.fn(() => gate.promise)

    const first = singleFlight('key', fn)
    const second = singleFlight('key', fn)
    gate.reject(new Error('nope'))

    await expect(first).rejects.toThrow('nope')
    await expect(second).rejects.toThrow('nope')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('keeps different keys independent', async () => {
    const gateA = deferred<string>()
    const gateB = deferred<string>()
    const fnA = jest.fn(() => gateA.promise)
    const fnB = jest.fn(() => gateB.promise)

    const a = singleFlight('a', fnA)
    const b = singleFlight('b', fnB)

    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)

    gateB.resolve('b')
    await expect(b).resolves.toBe('b')
    gateA.resolve('a')
    await expect(a).resolves.toBe('a')
  })
})
