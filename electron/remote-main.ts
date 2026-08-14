/**
 * 对标阿奇索历史 Electron 版：webview 使用 @electron/remote 作 csBridge.remote
 */
import type { WebContents } from 'electron'
import { enable, initialize } from '@electron/remote/main'

let inited = false

export function setupElectronRemote(): void {
  if (inited) return
  initialize()
  inited = true
}

export function enableElectronRemote(wc: WebContents): void {
  if (!wc || wc.isDestroyed()) return
  setupElectronRemote()
  try {
    enable(wc)
  } catch {
    /* 已 enable 或 webContents 已销毁 */
  }
}
