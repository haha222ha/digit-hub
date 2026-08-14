/**
 * 千帆 Eva（walle-eva）桌面端桥接垫片
 *
 * v4：优先 @electron/remote（阿奇索历史 Electron 版），fallback mock（CefSharp Pro 路径）
 */
import { ipcRenderer, shell } from 'electron'
import { join } from 'path'
import { createClientDb } from './client-db-shim'
import { EVA_CLIENT_VERSION, EVA_ELECTRON_VERSION } from './constants/eva-client'

type CsBridgeWindow = Window & {
  csBridge?: Record<string, unknown>
  __xhsCsBridgePageErrorsHooked?: boolean
  __xhsCsBridgePageErrors?: Array<{ type: string; message: string }>
}

type ElectronRemote = typeof import('@electron/remote')

function noop() {
  /* stub */
}

function noopPromise<T = void>(value?: T) {
  return Promise.resolve(value as T)
}

function loadElectronRemote(): ElectronRemote | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@electron/remote') as ElectronRemote
  } catch {
    return null
  }
}

function invokeCurrentWin<T = unknown>(method: string, ...args: unknown[]): Promise<T | undefined> {
  return Promise.resolve(ipcRenderer.invoke('invoke-current-win-function', method, ...args)).catch(
    () => undefined
  ) as Promise<T | undefined>
}

function syncAppPath(name?: string): string {
  try {
    return ipcRenderer.sendSync('eva:app-getPath', String(name || 'userData')) as string
  } catch {
    const map: Record<string, string> = {
      userData: process.env.APPDATA || 'C:\\Users\\Administrator\\AppData\\Roaming\\eva',
      temp: process.env.TEMP || 'C:\\Users\\Administrator\\AppData\\Local\\Temp',
      home: process.env.USERPROFILE || 'C:\\Users\\Administrator',
    }
    return map[String(name || 'userData')] || map.userData
  }
}

function createCookiesShim() {
  return {
    get: (_filter?: unknown) => noopPromise([] as unknown[]),
    set: (_details?: unknown) => noopPromise(undefined),
    remove: (_url?: unknown, _name?: unknown) => noopPromise(undefined),
  }
}

function patchAgisoWindowStubs(win: Record<string, unknown>) {
  win.setMaximumSize = noop
  win.setMinimumSize = noop
  win.invokeCurrentWindowFn = noop
  win.setBounds = noop
  return win
}

function createMockCurrentWindow(cookiesShim: ReturnType<typeof createCookiesShim>) {
  const invokeWin = invokeCurrentWin
  return {
    webContents: {
      id: 1,
      on: noop,
      once: noop,
      send: noop,
      session: { cookies: cookiesShim },
      getURL: () => (typeof location !== 'undefined' ? location.href : ''),
      getTitle: () => (typeof document !== 'undefined' ? document.title : ''),
      getId: () => 1,
      isDestroyed: () => false,
      isCrashed: () => false,
      executeJavaScript: (code: string) =>
        invokeWin('webContents.executeJavaScript', code).then((r) => r ?? undefined),
    },
    close: () => void invokeWin('close'),
    minimize: () => void invokeWin('minimize'),
    maximize: () => void invokeWin('maximize'),
    unmaximize: () => void invokeWin('unmaximize'),
    show: () => void invokeWin('show'),
    focus: () => void invokeWin('focus'),
    hide: () => void invokeWin('hide'),
    setSize: noop,
    setBounds: noop,
    setPosition: noop,
    setMinimumSize: noop,
    setMaximumSize: noop,
    setResizable: noop,
    isMaximized: () => false,
    isDestroyed: () => false,
    isVisible: () => true,
    isFocused: () => true,
    isFullScreen: () => false,
    getOpacity: () => 1,
    setOpacity: noop,
    getTitle: () => (typeof document !== 'undefined' ? document.title : ''),
    getBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
    getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
    getContentSize: () => [1200, 800] as [number, number],
    getSize: () => [1200, 800] as [number, number],
  }
}

function withMissLog<T extends Record<string, unknown>>(name: string, obj: T): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (prop === 'then') return undefined
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
      if (prop in target) return Reflect.get(target, prop, receiver)
      const p = String(prop)
      console.warn(`[csBridge-miss] ${name}.${p}`)
      const stub = ((..._args: unknown[]) => undefined) as unknown as Record<string, unknown> &
        ((...a: unknown[]) => unknown)
      return stub
    },
  }) as T
}

export function installCsBridge(): void {
  if (typeof window === 'undefined') return
  const w = window as CsBridgeWindow
  if (w.csBridge) return

  const electronRemote = loadElectronRemote()
  const cookiesShim = createCookiesShim()
  const injectJsPath = join(__dirname, 'xhs-preload.js')

  const shellShim = { openExternal: (url: string) => shell.openExternal(url) }
  const clipboardShim = {
    writeText: noop,
    readText: () => '',
    writeImage: noop,
    readImage: noop,
  }
  const nativeImageShim = {
    createFromDataURL: () => ({}),
    createEmpty: () => ({}),
  }

  const ipcRendererShim = {
    send: (channel: string, ...args: unknown[]) => {
      try {
        ipcRenderer.send(channel, ...args)
      } catch {
        /* ignore */
      }
    },
    invoke: (channel: string, ...args: unknown[]) =>
      Promise.resolve(ipcRenderer.invoke(channel, ...args)).catch(() => {
        if (channel === 'tab:getAllLogin') return []
        return null
      }),
    on: () => ipcRenderer,
    once: (_ch: string, fn: (...args: unknown[]) => void) => {
      ipcRenderer.once('xhs-shim-dummy', fn as never)
      return ipcRenderer
    },
    removeListener: () => ipcRenderer,
  }

  const clientDb = createClientDb()

  const getCurrentWindow = () => {
    if (electronRemote) {
      try {
        return patchAgisoWindowStubs(electronRemote.getCurrentWindow() as unknown as Record<string, unknown>)
      } catch {
        /* fallback mock */
      }
    }
    return createMockCurrentWindow(cookiesShim)
  }

  const appShim = electronRemote?.app
    ? electronRemote.app
    : {
        getVersion: () => EVA_CLIENT_VERSION,
        getName: () => 'eva',
        getPath: (name?: string) => syncAppPath(name),
        getAppPath: () => process.cwd(),
        isPackaged: true,
      }

  let remoteObj: Record<string, unknown>
  if (electronRemote) {
    remoteObj = electronRemote as unknown as Record<string, unknown>
  } else {
    const mockRemote: Record<string, unknown> = {}
    mockRemote.getCurrentWindow = getCurrentWindow
    mockRemote.require = (id: string) => {
      if (id === 'electron') {
        return withMissLog('electron', {
          shell: shellShim,
          nativeImage: nativeImageShim,
          clipboard: clipboardShim,
          remote: mockRemote,
          ipcRenderer: ipcRendererShim,
          app: appShim,
          session: { defaultSession: { cookies: cookiesShim } },
        })
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(id)
      } catch {
        return {}
      }
    }
    mockRemote.shell = shellShim
    mockRemote.nativeImage = nativeImageShim
    mockRemote.clipboard = clipboardShim
    mockRemote.app = appShim
    mockRemote.dialog = {
      showMessageBox: () => noopPromise({ response: 0 }),
      showOpenDialog: () => noopPromise({ canceled: true, filePaths: [] as string[] }),
      showSaveDialog: () => noopPromise({ canceled: true }),
    }
    mockRemote.process = {
      type: 'renderer',
      platform: process.platform,
      versions: process.versions,
      env: process.env,
    }
    remoteObj = withMissLog('remote', mockRemote)
  }

  w.csBridge = withMissLog('csBridge', {
    getCurrentWindow,
    remote: remoteObj,
    ipcRenderer: ipcRendererShim,
    clipboard: clipboardShim,
    nativeImage: nativeImageShim,
    notify: async (opts?: unknown) => {
      console.log('[csBridge] notify', opts)
    },
    winFlash: () => {
      try {
        const win = getCurrentWindow() as {
          isFocused?: () => boolean
          flashFrame?: (flag: boolean) => void
          once?: (ev: string, fn: () => void) => void
        }
        if (win?.isFocused?.()) return
        win?.flashFrame?.(true)
        win?.once?.('focus', () => win?.flashFrame?.(false))
      } catch {
        /* ignore */
      }
    },
    ...clientDb,
    shell: shellShim,
    appInfo: {
      injectJsPath,
      appVersion: EVA_CLIENT_VERSION,
      osVersion: process.getSystemVersion?.() || '10.0',
      platform: process.platform,
      electronVersion: EVA_ELECTRON_VERSION,
      nodeVersion: process.versions.node,
    },
    app: appShim,
    process: {
      type: 'renderer',
      platform: process.platform,
      versions: process.versions,
      env: { ...process.env, NODE_ENV: 'production', EVA_ENV: 'prod' },
    },
    clientDb,
    sitEnvDb: { updateSitUrl: noop },
    openArkDeepLink: (url: string) => shell.openExternal(url),
    getCurrentWindowData: (key?: string) => {
      if (key === 'id') return Promise.resolve('xhs-shipping-assistant-im-001')
      return Promise.resolve(null)
    },
    performance: {
      getProcessMemoryInfo: () => noopPromise({}),
      getProcessCPUUsage: () => noopPromise({}),
      getWindowCount: () => noopPromise(1),
      getDeviceId: () => noopPromise('xhs-shipping-assistant'),
    },
    supportNewUI: true,
    deprecateIpcQ: true,
    supportNewAcct: true,
    supportTab: true,
    supportFloatPlayVoice: true,
    supportFloatWin: true,
    supportArkLogin: true,
    supportBackgroundHigh: false,
    handleClientLogout: () => {
      void ipcRenderer.invoke('shop:logout')
      return true
    },
    isMac: process.platform === 'darwin',
  })

  if (!w.__xhsCsBridgePageErrorsHooked) {
    w.__xhsCsBridgePageErrorsHooked = true
    const buf: Array<{ type: string; message: string }> = []
    ;(w as unknown as { __xhsCsBridgePageErrors?: typeof buf }).__xhsCsBridgePageErrors = buf
    window.addEventListener('error', (e) => {
      buf.push({ type: 'error', message: e.message || String(e.error) })
      if (buf.length > 50) buf.shift()
    })
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason as { message?: string } | string | undefined
      buf.push({
        type: 'unhandledrejection',
        message: typeof reason === 'string' ? reason : reason?.message || String(reason),
      })
      if (buf.length > 50) buf.shift()
    })
  }
}
