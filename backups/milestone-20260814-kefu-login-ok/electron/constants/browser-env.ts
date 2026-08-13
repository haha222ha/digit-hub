import type { App } from 'electron'

/** 与 Electron 30 / Chromium 124 对齐，避免 UA 版本不一致被风控 */
export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export function applyElectronStealthFlags(app: App): void {
  app.commandLine.appendSwitch('user-agent', CHROME_UA)
  app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint')
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
}
