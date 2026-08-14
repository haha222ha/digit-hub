/**
 * 对标阿奇索 basePreload.ts — IM preload 内 window.electron.ipcRenderer
 */
import { ipcRenderer } from 'electron'

export default {
  log(msg: string, level: 'error' | 'warn' | 'info' | 'debug' = 'error') {
    ipcRenderer.send('on:log', msg, level)
  },
  sendMessage(channel: string, ...args: unknown[]) {
    ipcRenderer.send(channel, ...args)
  },
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args)
  },
  getMainWinContext() {
    return ipcRenderer.invoke('agiso:getMainWinContext') as Promise<{
      userEmail?: string
      userPassword?: string
      isRefreshLogin?: boolean
    }>
  },
}
