import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DownloadManagerItem from '../components/DownloadManagerItem'
import { DMQueueElement, GameInfo } from 'common/types'

const makeElement = (gameInfo?: GameInfo): DMQueueElement =>
  ({
    type: 'install',
    params: {
      appName: 'TestGame',
      runner: 'legendary',
      path: '/games/test',
      platformToInstall: 'windows',
      gameInfo
    },
    addToQueueTime: 1,
    startTime: 2,
    endTime: 3,
    status: 'done'
  }) as DMQueueElement

const renderItem = (element?: DMQueueElement) =>
  render(
    <MemoryRouter>
      <DownloadManagerItem element={element} current={false} />
    </MemoryRouter>
  )

describe('DownloadManagerItem', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the empty state without an element', () => {
    renderItem(undefined)
    expect(screen.getByText('Nothing to download')).toBeInTheDocument()
  })

  it('renders without throwing when params.gameInfo is undefined', () => {
    expect(() => renderItem(makeElement(undefined))).not.toThrow()
  })

  it('renders without throwing when gameInfo has no install', () => {
    const gameInfo = {
      app_name: 'TestGame',
      runner: 'legendary',
      title: 'Test Game'
    } as GameInfo
    expect(() => renderItem(makeElement(gameInfo))).not.toThrow()
  })

  it('keeps a stable hook count when the element appears and disappears', () => {
    const element = makeElement(undefined)
    const { rerender } = render(
      <MemoryRouter>
        <DownloadManagerItem element={undefined} current={false} />
      </MemoryRouter>
    )

    expect(() => {
      rerender(
        <MemoryRouter>
          <DownloadManagerItem element={element} current={false} />
        </MemoryRouter>
      )
      rerender(
        <MemoryRouter>
          <DownloadManagerItem element={undefined} current={false} />
        </MemoryRouter>
      )
    }).not.toThrow()
  })

  it('does not throw when getGameInfo rejects', async () => {
    ;(window.api.getGameInfo as jest.Mock).mockRejectedValue(
      new Error('backend down')
    )

    renderItem(makeElement(undefined))

    await waitFor(() => {
      expect(window.api.getGameInfo).toHaveBeenCalled()
    })
  })
})
