import {
  faBookOpen,
  faGamepad,
  faSlidersH,
  faStore,
  faUser,
  faUniversalAccess,
  faUserAlt,
  faWineGlass,
  faBarsProgress,
  faTv
} from '@fortawesome/free-solid-svg-icons'
import { useLocation } from 'react-router-dom'
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import QuitButton from '../QuitButton'
import SidebarItem from '../SidebarItem'

type PathSplit = [a: undefined, b: undefined, type: string]

export default function SidebarLinks() {
  const { t } = useTranslation()
  const location = useLocation() as { pathname: string }
  const [, , type] = location.pathname.split('/') as PathSplit

  const { amazon, epic, gog, zoom, lancommander, platform, refreshLibrary } =
    useContext(ContextProvider)

  const inWebviewScreen =
    location.pathname.includes('store') ||
    location.pathname.includes('last-url')
  const isSettings = location.pathname.includes('settings')
  const isWin = platform === 'win32'

  const loggedIn =
    epic.username ||
    gog.username ||
    amazon.user_id ||
    zoom.username ||
    lancommander.username

  async function handleRefresh() {
    localStorage.setItem('scrollPosition', '0')

    const shouldRefresh =
      (epic.username && !epic.library.length) ||
      (gog.username && !gog.library.length) ||
      (amazon.user_id && !amazon.library.length) ||
      (zoom.username && !zoom.library.length) ||
      (lancommander.username && !lancommander.library.length)
    if (shouldRefresh) {
      return refreshLibrary({ runInBackground: true })
    }
    return
  }

  // By default, open Epic Store
  let defaultStore = 'epic'
  if (
    zoom.enabled &&
    !epic.username &&
    !gog.username &&
    !amazon.user_id &&
    zoom.username
  ) {
    // Prioritize Zoom if only Zoom is logged in
    defaultStore = 'zoom'
  } else if (!epic.username && !gog.username && amazon.user_id) {
    // If only logged in to Amazon Games, open Amazon Gaming
    defaultStore = 'amazon'
  } else if (!epic.username && gog.username) {
    // Otherwise, if not logged in to Epic Games, open GOG Store
    defaultStore = 'gog'
  }

  // if we have a stored last-url, default to the `/last-url` route
  const lastStore = sessionStorage.getItem('last-store')
  if (lastStore) {
    defaultStore = lastStore
  }

  return (
    <div className="SidebarLinks Sidebar__section" data-tour="sidebar-menu">
      {!loggedIn && (
        <SidebarItem
          icon={faUser}
          label={t('button.login', 'Login')}
          url="/login"
          dataTour="sidebar-login"
        />
      )}
      <SidebarItem
        isActiveFallback={location.pathname.includes('gamepage')}
        url="/"
        icon={faGamepad}
        label={t('Library')}
        onClick={async () => handleRefresh()}
        dataTour="sidebar-library"
      />

      <div className="SidebarItemWithSubmenu">
        <SidebarItem
          isActiveFallback={location.pathname.includes('store')}
          url={`/store/${defaultStore}`}
          icon={faStore}
          label={t('stores', 'Stores')}
          dataTour="sidebar-stores"
        />
        {inWebviewScreen && (
          <div className="SidebarSubmenu">
            <SidebarItem
              className="SidebarLinks__subItem"
              url="/store/epic"
              label={t('store', 'Epic Store')}
            />
            <SidebarItem
              className="SidebarLinks__subItem"
              url="/store/gog"
              label={t('gog-store', 'GOG Store')}
            />
            <SidebarItem
              className="SidebarLinks__subItem"
              url="/store/amazon"
              label={t('amazon-luna', 'Amazon Luna')}
            />
            {zoom.enabled && (
              <SidebarItem
                className="SidebarLinks__subItem"
                url="/store/zoom"
                label={t('zoom-store', 'Zoom Store')}
              />
            )}
          </div>
        )}
      </div>
      <div className="divider" />
      <div className="SidebarItemWithSubmenu">
        <SidebarItem
          isActiveFallback={location.pathname.includes('settings')}
          icon={faSlidersH}
          label={t('Settings', 'Settings')}
          url="/settings/general"
          dataTour="sidebar-settings"
        />
        {isSettings && (
          <div className="SidebarSubmenu settings">
            <SidebarItem
              url="/settings/general"
              isActiveFallback={type === 'general'}
              className="SidebarLinks__subItem"
              label={t('settings.navbar.general')}
            />

            {!isWin && (
              <SidebarItem
                url="/settings/games_settings"
                isActiveFallback={type === 'games_settings'}
                className="SidebarLinks__subItem"
                label={t(
                  'settings.navbar.games_settings_defaults',
                  'Game Defaults'
                )}
              />
            )}

            <SidebarItem
              url="/settings/advanced"
              isActiveFallback={type === 'advanced'}
              className="SidebarLinks__subItem"
              label={t('settings.navbar.advanced', 'Advanced')}
            />

            <SidebarItem
              url="/settings/systeminfo"
              isActiveFallback={type === 'systeminfo'}
              className="SidebarLinks__subItem"
              label={t(
                'settings.navbar.systemInformation',
                'System Information'
              )}
            />

            <SidebarItem
              url="/settings/log"
              isActiveFallback={type === 'log'}
              className="SidebarLinks__subItem"
              label={t('settings.navbar.log', 'Log')}
            />
          </div>
        )}
      </div>
      <SidebarItem
        url="/console"
        icon={faTv}
        label={t('sidebar.console', 'Console Mode')}
        dataTour="sidebar-console"
      />

      <SidebarItem
        url="/download-manager"
        icon={faBarsProgress}
        label={t('download-manager.link', 'Downloads')}
        dataTour="sidebar-downloads"
      />

      {!isWin && (
        <SidebarItem
          url="/wine-manager"
          icon={faWineGlass}
          label={t('wine.manager.link', 'Wine Manager')}
          dataTour="sidebar-wine"
        />
      )}

      {loggedIn && (
        <SidebarItem
          url="/login"
          icon={faUserAlt}
          label={t('userselector.manageaccounts', 'Manage Accounts')}
          dataTour="sidebar-manage-accounts"
        />
      )}

      <SidebarItem
        url="/accessibility"
        icon={faUniversalAccess}
        label={t('accessibility.title', 'Accessibility')}
        dataTour="sidebar-accessibility"
      />

      <div className="divider" />

      <SidebarItem
        url="/wiki"
        icon={faBookOpen}
        label={t('docs', 'Documentation')}
        dataTour="sidebar-docs"
      />

      <QuitButton dataTour="sidebar-quit" />
    </div>
  )
}
