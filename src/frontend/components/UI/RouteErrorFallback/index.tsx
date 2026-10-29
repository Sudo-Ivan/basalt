import './index.css'

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useRouteError } from 'react-router-dom'

export default function RouteErrorFallback() {
  const { t } = useTranslation()
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  const logged = useRef(false)

  useEffect(() => {
    if (logged.current) {
      return
    }
    logged.current = true
    const stack =
      error instanceof Error ? error.stack || error.message : String(error)
    window.api.logError(String(stack))
  }, [error])

  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="routeErrorFallback">
      <h3 className="routeErrorTitle">
        {t('error-page.something-went-wrong', 'Something went wrong')}
      </h3>
      <p className="routeErrorMessage">{message}</p>
      <div className="routeErrorButtons">
        <button
          className="button is-primary"
          onClick={() =>
            navigate(`${location.pathname}${location.search}`, {
              replace: true
            })
          }
        >
          {t('error-page.try-again', 'Try again')}
        </button>
        <button
          className="button"
          onClick={() => navigate('/', { replace: true })}
        >
          {t('error-page.go-to-library', 'Go to Library')}
        </button>
        <button
          className="button is-danger"
          onClick={() => window.location.reload()}
        >
          {t('error-page.reload-window', 'Reload window')}
        </button>
      </div>
    </div>
  )
}
