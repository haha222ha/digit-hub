/**
 * v4（阿奇索历史 Electron）：nodeIntegration:true + @electron/remote + dashboard + Jl() rim bootstrap
 */
import { ipcRenderer } from 'electron'
import { CHROME_UA } from './constants/browser-env'
import { installCsBridge } from './cs-bridge-shim'
import { startRimBootstrap } from './rim-bootstrap'

installCsBridge()
startRimBootstrap()

function spoofChromeEnv() {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => CHROME_UA,
      configurable: true
    })
    Object.defineProperty(navigator, 'vendor', {
      get: () => 'Google Inc.',
      configurable: true
    })
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true
    })
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true
    })
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en'],
      configurable: true
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any
    if (nav.userAgentData) {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => undefined,
        configurable: true
      })
    }
    const w = window as unknown as { chrome?: { runtime: Record<string, never> } }
    if (!w.chrome) w.chrome = { runtime: {} }
  } catch {
    // ignore
  }
}

spoofChromeEnv()

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data?.type) return

  switch (data.type) {
    case 'xhs-401-redirect':
      ipcRenderer.send('xhs-401-redirect', data)
      break
    case 'xhs-csa-info':
      ipcRenderer.send('xhs-csa-info', data)
      break
    case 'xhs-login-user':
      ipcRenderer.send('xhs-login-user', data)
      break
    case 'xhs-new-order':
      ipcRenderer.send('xhs-new-order', data)
      break
    case 'xhs-kefu-message':
    case 'kefu-new-message':
      ipcRenderer.send('xhs-kefu-message', data)
      break
    case 'kefu-cookie-expired': {
      const href = window.location.href
      if (/\/login|cstools\/login|customer\.xiaohongshu\.com/.test(href)) break
      ipcRenderer.send('xhs-401-redirect', { url: data.url || href, reason: 'cookie_expired' })
      break
    }
  }
})
