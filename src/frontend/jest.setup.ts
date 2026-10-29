import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'util'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// jsdom does not provide the fetch/encoding globals that react-router
// and undici need, so polyfill them before anything else loads
Object.assign(globalThis, { TextEncoder, TextDecoder })
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeFetch = require('node-fetch')
Object.assign(globalThis, {
  fetch: nodeFetch.default,
  Headers: nodeFetch.Headers,
  Request: nodeFetch.Request,
  Response: nodeFetch.Response
})

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  react: { useSuspense: false }
})

const apiMockTarget: Record<string | symbol, unknown> = {}

// window.api is a lazy proxy so every method exists without having to
// enumerate the whole preload surface here
const apiMock = new Proxy(apiMockTarget, {
  get(target, prop) {
    if (!(prop in target)) {
      target[prop] = jest.fn()
    }
    return target[prop]
  }
})

Object.defineProperty(window, 'api', {
  value: apiMock,
  writable: true
})
