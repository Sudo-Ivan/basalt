import React, { useContext } from 'react'

import './App.css'
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouteObject,
  RouterProvider,
  useLocation
} from 'react-router-dom'
import Sidebar from './components/UI/Sidebar'
import ContextProvider from './state/ContextProvider'
import { ControllerHints, Help, OfflineMessage } from './components/UI'
import DialogHandler from './components/UI/DialogHandler'
import ExternalLinkDialog from './components/UI/ExternalLinkDialog'
import WindowControls from './components/UI/WindowControls'
import classNames from 'classnames'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import LogFileUploadDialog from './components/UI/LogFileUploadDialog'
import UploadedLogFilesList from './screens/Settings/sections/LogSettings/components/UploadedLogFilesList'
import { TourProvider } from './state/TourContext'
import { InstallGameWrapper } from './screens/Library/components/InstallModal'
import { SettingsModalWrapper } from './screens/Settings/components/SettingsModal'
import RouteErrorFallback from './components/UI/RouteErrorFallback'

function Root() {
  const {
    isRTL,
    isFullscreen,
    isFrameless,
    experimentalFeatures,
    help,
    disableAnimations
  } = useContext(ContextProvider)

  const hasNativeOverlayControls = navigator['windowControlsOverlay']?.visible
  const showOverlayControls = isFrameless && !hasNativeOverlayControls

  const isConsoleMode = useLocation().pathname.startsWith('/console')

  const theme = createTheme({
    direction: isRTL ? 'rtl' : 'ltr',
    typography: {
      fontFamily: 'var(--primary-font-family)'
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            color: 'var(--text-default)',
            backgroundColor: 'var(--background)'
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 'var(--text-md)',
            backgroundColor: 'var(--background-darker)',
            color: 'var(--text-primary)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--space-sm)',
            maxWidth: '350px'
          }
        }
      }
    }
  })

  return (
    <div
      id="app"
      className={classNames('App', {
        isRTL,
        frameless: isFrameless,
        fullscreen: isFullscreen,
        disableAnimations,
        consoleMode: isConsoleMode
      })}
      // disable dragging for all elements by default
      onDragStart={(e) => e.preventDefault()}
    >
      <ThemeProvider theme={theme}>
        {isConsoleMode ? (
          <main className="content consoleContent">
            <Outlet />
          </main>
        ) : (
          <TourProvider>
            <OfflineMessage />
            <Sidebar />
            <main className="content">
              <DialogHandler />
              <InstallGameWrapper />
              <SettingsModalWrapper />
              <ExternalLinkDialog />
              <LogFileUploadDialog />
              <UploadedLogFilesList />
              <Outlet />
            </main>
            <div className="controller">
              <ControllerHints />
              <dialog className="simple-keyboard-wrapper">
                <div className="simple-keyboard"></div>
              </dialog>
            </div>
            {showOverlayControls && <WindowControls />}
            {experimentalFeatures.enableHelp && <Help items={help.items} />}
          </TourProvider>
        )}
      </ThemeProvider>
    </div>
  )
}

function lazyRoute(
  loadComponent: () => Promise<Record<'default', React.ComponentType>>
) {
  return async () => {
    const component = await loadComponent()
    return { Component: component.default }
  }
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Root />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        errorElement: <RouteErrorFallback />,
        children: [
          {
            index: true,
            lazy: lazyRoute(() => import('./screens/Library'))
          },
          {
            path: 'login',
            lazy: lazyRoute(() => import('./screens/Login'))
          },
          {
            path: 'store/:store',
            lazy: lazyRoute(() => import('./screens/WebView'))
          },
          {
            path: 'wiki',
            lazy: lazyRoute(() => import('./screens/Docs'))
          },
          {
            path: 'gamepage/:runner/:appName',
            lazy: lazyRoute(() => import('./screens/Game/GamePage'))
          },
          {
            path: 'store-page',
            lazy: lazyRoute(() => import('./screens/WebView'))
          },
          {
            path: 'loginweb/:runner',
            lazy: lazyRoute(() => import('./screens/WebView'))
          },
          {
            path: 'settings/:type',
            lazy: lazyRoute(() => import('./screens/Settings'))
          },
          {
            path: 'wine-manager',
            lazy: lazyRoute(() => import('./screens/WineManager'))
          },
          {
            path: 'download-manager',
            lazy: lazyRoute(() => import('./screens/DownloadManager'))
          },
          {
            path: 'accessibility',
            lazy: lazyRoute(() => import('./screens/Accessibility'))
          },
          {
            path: 'console',
            lazy: lazyRoute(() => import('./screens/ConsoleMode'))
          },
          {
            path: '*',
            element: <Navigate replace to="/" />
          }
        ]
      }
    ]
  }
]

const router = createHashRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}
