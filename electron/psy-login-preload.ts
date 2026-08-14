/**
 * 心象测轻量登录窗 preload：只暴露登录/关闭，不注入完整后台能力。
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('psyLoginAPI', {
  status: () => ipcRenderer.invoke('psy:status'),
  login: (payload: { baseUrl?: string; username: string; password: string }) =>
    ipcRenderer.invoke('psy:login-window', payload),
  close: () => ipcRenderer.invoke('psy:close-login-window')
})
