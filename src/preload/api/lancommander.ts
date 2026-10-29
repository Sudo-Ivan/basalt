import { makeHandlerInvoker, makeListenerCaller } from '../ipc'

export const getLCUserInfo = makeHandlerInvoker('getLCUserInfo')
export const authLC = makeHandlerInvoker('authLC')
export const logoutLC = makeListenerCaller('logoutLC')
