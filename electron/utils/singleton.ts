import { app, BrowserWindow } from 'electron'

const MAIN_TITLE = '小红书发货助手'
const BACKGROUND_TITLE_RE = /客服聊天|订单轮询|千帆商家后台/

let lockAcquired = false

function isBackgroundWin(win: BrowserWindow): boolean {
  const t = String(win.getTitle() || '')
  if (BACKGROUND_TITLE_RE.test(t)) return true
  try {
    const url = win.webContents?.getURL?.() || ''
    if (/\/cstools\/chat/i.test(url) && !t.startsWith(MAIN_TITLE)) return true
  } catch {
    /* ignore */
  }
  return false
}

/**
 * 第二实例 / 托盘唤起：只亮主窗口，绝不把隐藏客服页顶到前台。
 * 多开客服页会互踢 CSA 登录，导致 XhsRim 发消息失败。
 */
export function focusAssistantMainWindow(): void {
  const all = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed())
  const main =
    all.find((w) => String(w.getTitle() || '').startsWith(MAIN_TITLE) && !isBackgroundWin(w)) ||
    all.find((w) => !isBackgroundWin(w)) ||
    null

  for (const w of all) {
    if (main && w === main) continue
    if (!isBackgroundWin(w)) continue
    try {
      w.setSkipTaskbar(true)
      if (w.isVisible()) w.hide()
    } catch {
      /* ignore */
    }
  }

  if (!main) return
  try {
    if (main.isMinimized()) main.restore()
    main.setSkipTaskbar(false)
    main.show()
    main.focus()
    main.setTitle(MAIN_TITLE)
  } catch {
    /* ignore */
  }
}

/**
 * 必须在 app.whenReady 之前调用。晚了第二实例会把隐藏客服窗当成主界面。
 */
export function acquireSingleInstanceLock(): boolean {
  if (lockAcquired) return true
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
    app.exit(0)
    return false
  }
  lockAcquired = true
  app.on('second-instance', () => {
    focusAssistantMainWindow()
  })
  return true
}

/** @deprecated 用 acquireSingleInstanceLock（启动最早阶段） */
export function preventMultipleInstance(): boolean {
  return acquireSingleInstanceLock()
}

export function ensureSingleInstance(): void {
  if (!acquireSingleInstanceLock()) {
    throw new Error('SINGLE_INSTANCE_QUIT')
  }
}
