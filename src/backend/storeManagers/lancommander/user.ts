import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import https from 'node:https'
import http from 'node:http'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isOnline } from '../../online_monitor'
import { clearCache } from 'backend/utils'
import { configStore } from './electronStores'
import { normalizeServerUrl } from './url'
import { LCAuthToken, LCLoginResult } from 'common/types/lancommander'
import { singleFlight } from 'backend/utils/singleFlight'
import { normalizeKeys } from './normalize'

export class LCUser {
  static agentFor(): { httpAgent?: http.Agent; httpsAgent?: https.Agent } {
    if (configStore.get('allowSelfSigned', false)) {
      return {
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    }
    return {}
  }

  static serverUrl(): string | undefined {
    return configStore.get_nodefault('serverUrl')
  }

  static async login(
    serverUrl: string,
    username: string,
    password: string,
    allowSelfSigned: boolean
  ): Promise<LCLoginResult> {
    let normalized: string
    try {
      normalized = normalizeServerUrl(serverUrl)
    } catch (error) {
      return { status: 'error', error: String(error) }
    }

    const httpsAgent = allowSelfSigned
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined

    try {
      const response = await axios.post<LCAuthToken>(
        `${normalized}/api/Auth/Login`,
        { Username: username, Password: password },
        {
          headers: { 'Content-Type': 'application/json' },
          httpsAgent,
          timeout: 20000
        }
      )

      const token = normalizeKeys(response.data)
      if (!token?.AccessToken) {
        return { status: 'error', error: 'Server did not return a token' }
      }

      configStore.set('serverUrl', normalized)
      configStore.set('allowSelfSigned', allowSelfSigned)
      configStore.set('accessToken', token.AccessToken)
      configStore.set('refreshToken', token.RefreshToken ?? '')
      configStore.set('tokenExpiration', token.Expiration ?? '')
      configStore.set('username', username)
      configStore.set('isLoggedIn', true)

      logInfo('Logged in to LANCommander', LogPrefix.LANCommander)
      return { status: 'done', data: { username } }
    } catch (error) {
      const status = (error as AxiosError).response?.status
      logError(
        ['LANCommander login failed:', String(error)],
        LogPrefix.LANCommander
      )
      if (status === 400 || status === 401 || status === 403) {
        return { status: 'error', error: 'Invalid username or password' }
      }
      return { status: 'error', error: String(error) }
    }
  }

  private static setToken(token: LCAuthToken) {
    configStore.set('accessToken', token.AccessToken)
    configStore.set('refreshToken', token.RefreshToken ?? '')
    configStore.set('tokenExpiration', token.Expiration ?? '')
  }

  private static markLoggedOut() {
    configStore.set('accessToken', '')
    configStore.set('refreshToken', '')
    configStore.set('tokenExpiration', '')
    configStore.set('isLoggedIn', false)
  }

  static async refreshToken(): Promise<boolean> {
    return singleFlight('lancommander-refresh', async () => {
      const serverUrl = this.serverUrl()
      const accessToken = configStore.get('accessToken', '')
      const refreshToken = configStore.get('refreshToken', '')
      if (!serverUrl || !refreshToken) {
        return false
      }
      try {
        const response = await axios.post<LCAuthToken>(
          `${serverUrl}/api/Auth/Refresh`,
          {
            AccessToken: accessToken,
            RefreshToken: refreshToken,
            Expiration: configStore.get('tokenExpiration', '')
          },
          {
            headers: { 'Content-Type': 'application/json' },
            ...this.agentFor(),
            timeout: 15000
          }
        )
        const token = normalizeKeys(response.data)
        if (!token?.AccessToken) {
          return false
        }
        this.setToken(token)
        return true
      } catch (error) {
        logWarning(
          ['LANCommander token refresh failed:', String(error)],
          LogPrefix.LANCommander
        )
        return false
      }
    })
  }

  /**
   * Perform an authenticated request against the configured server.
   * Retries once after a token refresh on 401.
   */
  static async request<T>(
    method: 'get' | 'post' | 'head' | 'put' | 'delete',
    path: string,
    options: AxiosRequestConfig = {},
    retry = true
  ): Promise<AxiosResponse<T>> {
    const serverUrl = this.serverUrl()
    const accessToken = configStore.get('accessToken', '')
    if (!serverUrl || !accessToken) {
      throw new Error('Not logged in to LANCommander')
    }

    const doRequest = async (): Promise<AxiosResponse<T>> => {
      const response = await axios.request<T>({
        ...options,
        method,
        url: `${serverUrl}${path}`,
        timeout: options.timeout ?? 60000,
        ...this.agentFor(),
        headers: {
          Accept: 'application/json',
          ...(options.headers ?? {}),
          Authorization: `Bearer ${configStore.get('accessToken', '')}`
        }
      })
      if (
        options.responseType !== 'stream' &&
        response.data !== null &&
        typeof response.data === 'object'
      ) {
        response.data = normalizeKeys(response.data)
      }
      return response
    }

    try {
      return await doRequest()
    } catch (error) {
      const status = (error as AxiosError).response?.status
      if (status === 401 && retry) {
        if (await this.refreshToken()) {
          return this.request<T>(method, path, options, false)
        }
        this.markLoggedOut()
        throw new Error('LANCommander session expired')
      }
      throw error
    }
  }

  static async getUserDetails(): Promise<{ username: string } | undefined> {
    const username = configStore.get_nodefault('username')
    if (username) {
      return { username }
    }
    return undefined
  }

  static async isLoggedIn(): Promise<boolean> {
    if (!isOnline()) {
      return configStore.get('isLoggedIn', false)
    }
    const serverUrl = this.serverUrl()
    if (!serverUrl || !configStore.get('accessToken', '')) {
      return false
    }
    try {
      const expiration = configStore.get('tokenExpiration', '')
      if (expiration && new Date(expiration).getTime() < Date.now() + 60_000) {
        const refreshed = await this.refreshToken()
        if (!refreshed) {
          this.markLoggedOut()
          return false
        }
      }
      await this.request('post', '/api/Auth/Validate')
      return configStore.get('isLoggedIn', false)
    } catch {
      return configStore.get('isLoggedIn', false)
    }
  }

  static isLoggedInSync(): boolean {
    return (
      configStore.get('isLoggedIn', false) &&
      !!configStore.get('accessToken', '') &&
      !!configStore.get_nodefault('serverUrl')
    )
  }

  static async logout() {
    try {
      if (this.serverUrl() && configStore.get('accessToken', '')) {
        await this.request('post', '/api/Auth/Logout')
      }
    } catch {
      // Server may be unreachable; local logout still proceeds
    }
    clearCache('lancommander')
    configStore.clear()
    logInfo('Logged out from LANCommander', LogPrefix.LANCommander)
  }
}
