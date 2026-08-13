import { app, BrowserWindow } from 'electron'

/**
 * 单实例锁
 * - 对标原版防止重复启动
 * - 关键：必须同步阻止后续初始化，否则 app.quit() 异步性会导致端口冲突
 */
export function preventMultipleInstance(): boolean {
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
    app.exit(0)
    return false
  }

  app.on('second-instance', () => {
    // 有人试图运行第二个实例，我们应该聚焦到主窗口
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  return true
}

/**
 * 在 initialize() 中使用此函数确保单实例
 * 如果不是单实例，立即抛出错误中断后续初始化
 */
export function ensureSingleInstance(): void {
  if (!preventMultipleInstance()) {
    // 抛出错误以中断 initialize() 后续流程
    // 防止 app.quit() 异步执行时端口被占用
    throw new Error('SINGLE_INSTANCE_QUIT')
  }
}