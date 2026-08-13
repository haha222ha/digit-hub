/**
 * 千帆 Eva（walle-eva）桌面端桥接垫片
 *
 * 官方千帆 / 阿奇锁在加载 walle 页面前都会注入 window.csBridge。
 * 缺少时 Eva SPA 会走 require("electron").remote 并白屏：
 *   Cannot read properties of undefined (reading 'remote')
 */
import { ipcRenderer, shell } from 'electron'
import { createClientDb } from './client-db-shim'
import { EVA_CLIENT_VERSION, EVA_ELECTRON_VERSION } from './constants/eva-client'

type CsBridgeWindow = Window & {
  csBridge?: Record<string, unknown>
}

function noop() {
  /* stub */
}

function noopPromise<T = void>(value?: T) {
  return Promise.resolve(value as T)
}

export function installCsBridge(): void {
  if (typeof window === 'undefined') return
  const w = window as CsBridgeWindow
  if (w.csBridge) return

  const currentWindow = {
    webContents: { id: 1, on: noop, once: noop, send: noop },
    close: noop,
    minimize: noop,
    maximize: noop,
    unmaximize: noop,
    show: noop,
    focus: noop,
    hide: noop,
    setSize: noop,
    setBounds: noop,
    setMinimumSize: noop,
    setMaximumSize: noop,
    setResizable: noop,
    isMaximized: () => false,
    isDestroyed: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
  }

  const remote = {
    getCurrentWindow: () => currentWindow,
    /**
     * Eva: y.electron = csBridge.getRemote().require("electron")
     * 缺 require 会炸 IM SDK，客服会话列表空白
     */
    require: (id: string) => {
      if (id === 'electron') {
        return {
          ipcRenderer,
          shell,
          remote,
          clipboard: {
            writeText: noop,
            readText: () => '',
            writeImage: noop,
            readImage: noop
          },
          nativeImage: {
            createFromDataURL: () => ({}),
            createEmpty: () => ({})
          }
        }
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(id)
      } catch {
        return {}
      }
    },
    app: {
      getVersion: () => EVA_CLIENT_VERSION,
      getName: () => 'eva',
    },
    shell: {
      openExternal: (url: string) => shell.openExternal(url),
    },
    process: {
      platform: process.platform,
      versions: process.versions,
      env: process.env,
    },
  }

  const clientDb = createClientDb()

  // 对标官方：部分路径走 Module.require("electron")；主路径走 remote.require
  const requireShim = remote.require

  w.csBridge = {
    getCurrentWindow: () => currentWindow,
    getRemote: () => remote,
    remote,
    require: requireShim,
    // 部分 bundle 用 csBridge.registDb 或 csBridge.clientDb.registDb
    ...clientDb,
    ipcRenderer: {
      send: (channel: string, ...args: unknown[]) => {
        try {
          ipcRenderer.send(channel, ...args)
        } catch {
          /* Eva 内部 channel，主进程未监听时忽略 */
        }
      },
      invoke: (channel: string, ...args: unknown[]) => {
        try {
          return ipcRenderer.invoke(channel, ...args)
        } catch {
          return noopPromise(null)
        }
      },
      on: () => ipcRenderer,
      once: (_ch: string, fn: (...args: unknown[]) => void) => {
        ipcRenderer.once('xhs-shim-dummy', fn as never)
        return ipcRenderer
      },
      removeListener: () => ipcRenderer,
    },
    shell: {
      openExternal: (url: string) => shell.openExternal(url),
    },
    appInfo: {
      appVersion: EVA_CLIENT_VERSION,
      osVersion: process.getSystemVersion?.() || '10.0',
      platform: process.platform,
      electronVersion: EVA_ELECTRON_VERSION,
      nodeVersion: process.versions.node,
    },
    clientDb,
    sitEnvDb: {
      updateSitUrl: noop,
    },
    openArkDeepLink: (url: string) => shell.openExternal(url),
    getCurrentWindowData: () => ({
      width: 1200,
      height: 800,
      isMaximized: false,
      isFullScreen: false,
    }),
    performance: {
      getProcessMemoryInfo: () => noopPromise({}),
      getProcessCPUUsage: () => noopPromise({}),
      getWindowCount: () => noopPromise(1),
      getDeviceId: () => noopPromise('xhs-shipping-assistant'),
    },
    supportNewUI: true,
    supportTab: false,
    supportFloatPlayVoice: false,
    supportFloatWin: false,
    supportArkLogin: true,
    supportBackgroundHigh: false,
    handleClientLogout: () => null,
    isMac: process.platform === 'darwin',
  }
}
