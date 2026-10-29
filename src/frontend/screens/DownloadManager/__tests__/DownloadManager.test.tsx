import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DownloadManager from '..'
import { DMQueueElement, GameInfo } from 'common/types'
import { DMQueue } from 'frontend/types'

const makeElement = (
  appName: string,
  endTime = 1,
  gameInfo?: GameInfo
): DMQueueElement =>
  ({
    type: 'install',
    params: {
      appName,
      runner: 'legendary',
      path: '/games/x',
      platformToInstall: 'windows',
      gameInfo
    },
    addToQueueTime: 1,
    startTime: 1,
    endTime,
    status: 'done'
  }) as DMQueueElement

const setupApi = (impl: () => Promise<DMQueue | undefined>) => {
  ;(window.api.getDMQueueInformation as jest.Mock).mockImplementation(impl)
  ;(window.api.handleDMQueueInformation as jest.Mock).mockReturnValue(
    () => undefined
  )
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <DownloadManager />
    </MemoryRouter>
  )

describe('DownloadManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with queue elements lacking gameInfo, finished entries and a malformed element', async () => {
    setupApi(async () => ({
      elements: [
        makeElement('CurrentGame', 0, undefined),
        makeElement('QueuedGame', 0, undefined),
        { type: 'install' } as DMQueueElement
      ],
      finished: [makeElement('DoneGame', 10, undefined)],
      state: 'idle'
    }))

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText('Downloads', { exact: false })
      ).toBeInTheDocument()
    })
  })

  it('renders when the backend returns undefined arrays', async () => {
    setupApi(async () => ({}) as DMQueue)

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText('Downloads', { exact: false })
      ).toBeInTheDocument()
    })
  })

  it('does not mutate the finished array it was given', async () => {
    const finished = [
      makeElement('Oldest', 1),
      makeElement('Middle', 2),
      makeElement('Newest', 3)
    ]
    setupApi(async () => ({
      elements: [],
      finished,
      state: 'idle'
    }))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    expect(finished.map((e) => e.params.appName)).toEqual([
      'Oldest',
      'Middle',
      'Newest'
    ])
  })

  it('leaves the loader when the queue call rejects', async () => {
    setupApi(async () => {
      throw new Error('ipc down')
    })

    const { container } = renderPage()

    await waitFor(() => {
      expect(container.querySelector('.UpdateComponent')).toBeNull()
      expect(
        screen.getByText('Downloads', { exact: false })
      ).toBeInTheDocument()
    })
  })
})
