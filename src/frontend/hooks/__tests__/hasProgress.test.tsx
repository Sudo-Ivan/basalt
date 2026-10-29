import { renderHook } from '@testing-library/react'
import { hasProgress } from '../hasProgress'

describe('hasProgress', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns a progress object with no stored progress', () => {
    const { result } = renderHook(() => hasProgress('app', 'legendary'))
    const [current] = result.current
    expect(current).toBeDefined()
  })

  it('does not throw on corrupt localStorage data', () => {
    window.localStorage.setItem('app_legendary_progress', '{not json!!!')

    expect(() =>
      renderHook(() => hasProgress('app', 'legendary'))
    ).not.toThrow()
  })

  it('does not throw on non-object localStorage data', () => {
    window.localStorage.setItem('app_legendary_progress', '["unclosed"')

    expect(() =>
      renderHook(() => hasProgress('app', 'legendary'))
    ).not.toThrow()
  })
})
