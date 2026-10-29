import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  Outlet,
  RouteObject,
  RouterProvider
} from 'react-router-dom'

import RouteErrorFallback from '..'

jest.mock('frontend/components/UI/Sidebar', () => ({
  __esModule: true,
  default: () => <div>Sidebar</div>
}))
jest.mock('frontend/components/UI', () => ({
  ControllerHints: () => null,
  Help: () => null,
  OfflineMessage: () => null
}))
jest.mock('frontend/components/UI/DialogHandler', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/ExternalLinkDialog', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/WindowControls', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/LogFileUploadDialog', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock(
  'frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList',
  () => ({ __esModule: true, default: () => null })
)
jest.mock('frontend/state/TourContext', () => ({
  TourProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
jest.mock('frontend/screens/Library/components/InstallModal', () => ({
  InstallGameWrapper: () => null
}))
jest.mock('frontend/screens/Settings/components/SettingsModal', () => ({
  SettingsModalWrapper: () => null
}))

import { routes } from 'frontend/App'

let shouldThrow = true
const BrokenPage = () => {
  if (shouldThrow) {
    throw new Error('boom')
  }
  return <div>Recovered page</div>
}

const Layout = () => (
  <div>
    <nav>SidebarMarker</nav>
    <Outlet />
  </div>
)

const makeRoutes = (): RouteObject[] => [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorFallback />,
    children: [
      {
        errorElement: <RouteErrorFallback />,
        children: [
          { index: true, element: <div>LibraryHome</div> },
          { path: 'broken', element: <BrokenPage /> }
        ]
      }
    ]
  }
]

const renderAt = (path: string) =>
  render(
    <RouterProvider
      router={createMemoryRouter(makeRoutes(), { initialEntries: [path] })}
    />
  )

describe('RouteErrorFallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    shouldThrow = true
  })

  it('renders the fallback with three recovery buttons when a route throws', () => {
    renderAt('/broken')

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
    expect(screen.getByText('Go to Library')).toBeInTheDocument()
    expect(screen.getByText('Reload window')).toBeInTheDocument()
  })

  it('logs the route error through window.api.logError', () => {
    renderAt('/broken')

    expect(window.api.logError).toHaveBeenCalled()
    expect(
      String((window.api.logError as jest.Mock).mock.calls[0][0])
    ).toContain('boom')
  })

  it('keeps the surrounding layout rendered when a child page throws', () => {
    renderAt('/broken')

    expect(screen.getByText('SidebarMarker')).toBeInTheDocument()
  })

  it('navigates to the library with Go to Library', async () => {
    renderAt('/broken')

    fireEvent.click(screen.getByText('Go to Library'))

    await waitFor(() => {
      expect(screen.getByText('LibraryHome')).toBeInTheDocument()
    })
  })

  it('recovers the route with Try again once the error condition is gone', async () => {
    renderAt('/broken')
    shouldThrow = false

    fireEvent.click(screen.getByText('Try again'))

    await waitFor(() => {
      expect(screen.getByText('Recovered page')).toBeInTheDocument()
    })
  })

  it('renders the error page without a surrounding layout at the top level', () => {
    const routes: RouteObject[] = [
      {
        path: '/',
        element: <BrokenPage />,
        errorElement: <RouteErrorFallback />
      }
    ]
    render(
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/'] })}
      />
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByText('SidebarMarker')).toBeNull()
  })

  describe('application routes', () => {
    it('has an error element at both levels and a catch-all redirect', () => {
      const [root] = routes
      expect(root.errorElement).toBeTruthy()

      const [group] = root.children ?? []
      expect(group.errorElement).toBeTruthy()

      const leafRoutes = group.children ?? []
      expect(leafRoutes.some((route) => route.path === '*')).toBe(true)
      expect(leafRoutes.length).toBeGreaterThan(5)
    })
  })
})
