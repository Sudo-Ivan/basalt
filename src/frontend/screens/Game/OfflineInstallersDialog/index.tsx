import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LinearProgress, MenuItem } from '@mui/material'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import SelectField from 'frontend/components/UI/SelectField'
import { size } from 'frontend/helpers'

import type {
  GogOfflineInstallerProgress,
  ProductsEndpointInstaller
} from 'common/types/gog'

interface Props {
  appName: string
  onClose: () => void
}

type DownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'abort'

export default function OfflineInstallersDialog({ appName, onClose }: Props) {
  const { t } = useTranslation('gamepage')
  const [installers, setInstallers] = useState<
    ProductsEndpointInstaller[] | null
  >(null)
  const [installerId, setInstallerId] = useState('')
  const [destination, setDestination] = useState('')
  const [state, setState] = useState<DownloadState>('idle')
  const [progress, setProgress] = useState<GogOfflineInstallerProgress | null>(
    null
  )
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    void window.api.getGogOfflineInstallers(appName).then((result) => {
      setInstallers(result)
      const first = result.find((i) => i.os === 'windows') ?? result[0]
      if (first) setInstallerId(first.id)
    })
  }, [appName])

  useEffect(() => {
    if (state !== 'downloading') return
    return window.api.onGogOfflineInstallerProgress((e, payload) => {
      if (payload.appName === appName) setProgress(payload)
    })
  }, [state, appName])

  async function chooseDestination() {
    const path = await window.api.openDialog({
      buttonLabel: t('box.choose', 'Choose'),
      properties: ['openDirectory'],
      title: t('offlineInstaller.chooseFolder', 'Choose destination folder')
    })
    if (path) setDestination(path)
  }

  async function startDownload() {
    const installer = installers?.find((i) => i.id === installerId)
    if (!installer || !destination) return
    setProgress(null)
    setErrorMessage('')
    setState('downloading')
    const result = await window.api.downloadGogOfflineInstaller(
      appName,
      installer,
      destination
    )
    if (result.status === 'error') {
      setErrorMessage(result.error ?? 'Unknown error')
    }
    setState(result.status)
  }

  function cancelDownload() {
    window.api.abort(`${appName}_offline_installer`)
  }

  const installer = installers?.find((i) => i.id === installerId)
  const downloading = state === 'downloading'

  return (
    <Dialog showCloseButton onClose={onClose}>
      <DialogHeader onClose={onClose}>
        {t('offlineInstaller.title', 'Download offline installer')}
      </DialogHeader>
      <DialogContent>
        {installers === null && <p>{t('loading', 'Loading')}...</p>}
        {installers !== null && !installers.length && (
          <p>
            {t(
              'offlineInstaller.none',
              'GOG does not offer offline installers for this game.'
            )}
          </p>
        )}
        {!!installers?.length && (
          <>
            <SelectField
              htmlId="offline-installer-select"
              label={t('offlineInstaller.installer', 'Installer')}
              value={installerId}
              onChange={(e) => setInstallerId(e.target.value)}
              disabled={downloading}
            >
              {installers.map((i) => (
                <MenuItem key={i.id} value={i.id}>
                  {`${i.os} - ${i.language_full} - ${i.version} (${size(
                    i.total_size
                  )})`}
                </MenuItem>
              ))}
            </SelectField>
            <div className="offlineInstallerDestination">
              <button
                className="button is-primary"
                onClick={chooseDestination}
                disabled={downloading}
              >
                {t(
                  'offlineInstaller.chooseFolder',
                  'Choose destination folder'
                )}
              </button>
              <span>{destination || ' '}</span>
            </div>
            {downloading && (
              <div className="offlineInstallerProgress">
                <LinearProgress
                  variant="determinate"
                  value={progress?.totalPercent ?? 0}
                />
                <span>
                  {progress
                    ? `${progress.fileIndex}/${progress.totalFiles} ${progress.fileName} - ${progress.totalPercent}%`
                    : '0%'}
                </span>
              </div>
            )}
            {state === 'done' && (
              <p>
                {t(
                  'offlineInstaller.done',
                  'Download finished. The installer files are in {{path}}.',
                  { path: destination }
                )}
              </p>
            )}
            {state === 'abort' && (
              <p>{t('offlineInstaller.aborted', 'Download cancelled.')}</p>
            )}
            {state === 'error' && (
              <p className="offlineInstallerError">
                {t('offlineInstaller.error', 'Download failed: {{error}}', {
                  error: errorMessage
                })}
              </p>
            )}
          </>
        )}
      </DialogContent>
      <DialogFooter>
        {state === 'done' && (
          <button
            className="button is-secondary"
            onClick={() => window.api.openFolder(destination)}
          >
            {t('button.open_folder', 'Open Folder')}
          </button>
        )}
        {downloading ? (
          <button className="button is-danger" onClick={cancelDownload}>
            {t('button.cancel', 'Cancel')}
          </button>
        ) : (
          !!installers?.length && (
            <button
              className="button is-primary"
              onClick={startDownload}
              disabled={!installer || !destination}
            >
              {t('offlineInstaller.download', 'Download')}
            </button>
          )
        )}
      </DialogFooter>
    </Dialog>
  )
}
