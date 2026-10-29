import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'

export default function LANCommanderLogin() {
  const { lancommander } = useContext(ContextProvider)
  const { t } = useTranslation()

  const [serverUrl, setServerUrl] = useState(lancommander.serverUrl ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [allowSelfSigned, setAllowSelfSigned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await lancommander.login({
        serverUrl,
        username,
        password,
        allowSelfSigned
      })
      if (result.status !== 'done') {
        setError(result.error || t('login.lancommander.failed', 'Login failed'))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      className="lancommanderLogin"
      onSubmit={handleSubmit}
      aria-label="LANCommander login"
    >
      <input
        name="serverUrl"
        type="text"
        required
        placeholder={t('login.lancommander.server', 'Server URL')}
        value={serverUrl}
        onChange={(e) => setServerUrl(e.target.value)}
      />
      <input
        name="username"
        type="text"
        required
        placeholder={t('login.username', 'Username')}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        name="password"
        type="password"
        required
        placeholder={t('login.password', 'Password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label>
        <input
          name="allowSelfSigned"
          type="checkbox"
          checked={allowSelfSigned}
          onChange={(e) => setAllowSelfSigned(e.target.checked)}
        />
        {t('login.lancommander.selfsigned', 'Allow self-signed certificate')}
      </label>
      <small className="lancommanderNotice">
        {t(
          'login.lancommander.notice',
          'Scripts provided by this server can run on your system with your permissions when PowerShell 7 is installed. Only connect to servers you trust.'
        )}
      </small>
      {error && <span className="loginError">{error}</span>}
      <button className="button is-primary" type="submit" disabled={loading}>
        {loading
          ? t('login.logging-in', 'Logging in...')
          : t('login.lancommander.login', 'LANCommander Login')}
      </button>
    </form>
  )
}
