import { TypeCheckedStoreBackend } from 'backend/electron_store'
import { DMQueueElement } from 'common/types'

jest.mock('electron')

jest.mock('electron-store', () => {
  const shared = new Map<string, unknown>()
  return class MockStore {
    constructor(public options?: Record<string, unknown>) {}
    get(key: string, defaultValue?: unknown) {
      return shared.has(key) ? shared.get(key) : defaultValue
    }
    set(key: string, value: unknown) {
      shared.set(key, value)
    }
    has(key: string) {
      return shared.has(key)
    }
    delete(key: string) {
      shared.delete(key)
    }
  }
})

jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {}
}))

jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(() => '0 MB'),
  removeFolder: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { DownloadManager: 'DownloadManager' }
}))

jest.mock('../utils', () => ({
  installQueueElement: jest.fn(),
  updateQueueElement: jest.fn()
}))

jest.mock('backend/ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn()
}))

jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn()
}))

jest.mock('i18next', () => ({
  t: jest.fn((key: string) => key)
}))

jest.mock('backend/storeManagers/gog/redist', () => ({
  createRedistDMQueueElement: jest.fn()
}))

jest.mock('backend/storeManagers/gog/constants', () => ({
  gogRedistPath: '/tmp/gog-redist'
}))

jest.mock('backend/online_monitor', () => ({
  onConnectivityChange: jest.fn()
}))

import { getQueueInformation } from '../downloadqueue'

const queueStore = new TypeCheckedStoreBackend('downloadManager', {
  cwd: 'store',
  name: 'download-manager'
})

const validElement = (appName: string): DMQueueElement => ({
  type: 'install',
  params: {
    appName,
    runner: 'legendary',
    path: '/games/x',
    platformToInstall: 'windows',
    gameInfo: {} as DMQueueElement['params']['gameInfo']
  },
  addToQueueTime: 1,
  startTime: 2,
  endTime: 3
})

describe('getQueueInformation', () => {
  beforeEach(() => {
    queueStore.set('queue', [])
    queueStore.set('finished', [])
  })

  it('returns queued and finished elements', () => {
    queueStore.set('queue', [validElement('a')])
    queueStore.set('finished', [validElement('b')])

    const { elements, finished } = getQueueInformation()
    expect(elements).toHaveLength(1)
    expect(finished).toHaveLength(1)
  })

  it('drops queue elements without params', () => {
    queueStore.set('queue', [
      validElement('a'),
      { type: 'install' } as DMQueueElement,
      null as unknown as DMQueueElement
    ])

    const { elements } = getQueueInformation()
    expect(elements).toHaveLength(1)
    expect(elements[0].params.appName).toBe('a')
    expect(queueStore.get('queue', [])).toHaveLength(1)
  })

  it('drops queue elements without params.appName', () => {
    queueStore.set('queue', [
      validElement('a'),
      { ...validElement('b'), params: { runner: 'gog' } } as DMQueueElement
    ])

    const { elements } = getQueueInformation()
    expect(elements).toHaveLength(1)
  })

  it('drops finished elements without params', () => {
    queueStore.set('finished', [validElement('a'), {} as DMQueueElement])

    const { finished } = getQueueInformation()
    expect(finished).toHaveLength(1)
    expect(queueStore.get('finished', [])).toHaveLength(1)
  })

  it('does not rewrite the store when all entries are valid', () => {
    const valid = [validElement('a')]
    queueStore.set('queue', valid)

    getQueueInformation()
    expect(queueStore.get('queue', [])).toEqual(valid)
  })
})
