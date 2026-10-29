import { isListFresh } from '../listFreshness'

describe('isListFresh', () => {
  const now = 1_000_000
  const windowMs = 2 * 60 * 1000

  it('is fresh right after success', () => {
    expect(isListFresh(now, now, windowMs)).toBe(true)
  })

  it('is fresh inside the window', () => {
    expect(isListFresh(now - windowMs + 1, now, windowMs)).toBe(true)
  })

  it('is stale at the window boundary', () => {
    expect(isListFresh(now - windowMs, now, windowMs)).toBe(false)
  })

  it('is stale past the window', () => {
    expect(isListFresh(now - windowMs - 1, now, windowMs)).toBe(false)
  })

  it('is stale when never refreshed', () => {
    expect(isListFresh(0, now, windowMs)).toBe(false)
  })

  it('is stale when the timestamp is in the future', () => {
    expect(isListFresh(now + 1, now, windowMs)).toBe(false)
  })
})
