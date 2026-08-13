/**
 * 崩溃恢复服务
 * 对标原版 CEF异常-崩溃-OutOfMemory 处理
 *
 * 核心功能：
 * - 监听渲染进程崩溃
 * - 自动重试（最多 10 次）
 * - 5 分钟超时重置计数器
 * - 内存监控和预防性刷新
 */
import { BrowserWindow } from 'electron'
import { LoggerService } from './logger.service'

export class CrashRecoveryService {
  private logger: LoggerService
  private window: BrowserWindow | null = null
  private crashRetryCount = 0
  private maxRetry = 10
  private resetTimeout = 5 * 60 * 1000 // 5 分钟
  private resetTimer: NodeJS.Timeout | null = null
  private memoryCheckInterval: NodeJS.Timeout | null = null
  private lastReloadTime = 0
  private minReloadInterval = 30 * 1000 // 最小刷新间隔 30 秒

  constructor(logger: LoggerService) {
    this.logger = logger
  }

  /**
   * 绑定窗口，开始监听崩溃事件
   */
  bind(window: BrowserWindow): void {
    this.window = window
    this.logger.info('[CrashRecovery] 绑定窗口，开始监听崩溃事件')

    // 监听渲染进程崩溃
    window.webContents.on('render-process-gone', async (_event, details) => {
      await this.handleCrash(details)
    })

    // 监听无响应
    window.on('unresponsive', () => {
      this.logger.warn('[CrashRecovery] 窗口无响应')
      this.handleUnresponsive()
    })

    // 监听响应恢复
    window.on('responsive', () => {
      this.logger.info('[CrashRecovery] 窗口已恢复响应')
    })

    // 启动内存监控
    this.startMemoryMonitor()
  }

  /**
   * 处理 BrowserView WebContents 崩溃
   */
  async handleWebContentsCrash(webContents: Electron.WebContents, details: Electron.RenderProcessGoneDetails): Promise<void> {
    this.logger.error(`[CrashRecovery] WebContents 崩溃: reason=${details.reason}`)
    if (this.crashRetryCount >= this.maxRetry) {
      this.logger.error(`[CrashRecovery] 已达最大重试次数 (${this.maxRetry})`)
      return
    }
    this.crashRetryCount++
    this.scheduleReset()
    try {
      webContents.reload()
      this.lastReloadTime = Date.now()
    } catch (error) {
      this.logger.error('[CrashRecovery] WebContents 刷新失败:', error)
    }
  }

  /**
   * 处理渲染进程崩溃
   */
  private async handleCrash(details: Electron.RenderProcessGoneDetails): Promise<void> {
    const reason = details.reason
    const exitCode = details.exitCode

    this.logger.error(`[CrashRecovery] 渲染进程崩溃: reason=${reason}, exitCode=${exitCode}`)

    // 检查重试次数
    if (this.crashRetryCount >= this.maxRetry) {
      this.logger.error(`[CrashRecovery] 已达最大重试次数 (${this.maxRetry})，停止重试`)
      return
    }

    this.crashRetryCount++
    this.logger.info(`[CrashRecovery] 尝试恢复 (${this.crashRetryCount}/${this.maxRetry})`)

    // 设置超时重置
    this.scheduleReset()

    // 根据崩溃原因采取不同策略
    switch (reason) {
      case 'oom':
        await this.handleOutOfMemory()
        break
      case 'crashed':
        await this.handleCrashed()
        break
      case 'killed':
        await this.handleKilled()
        break
      default:
        await this.reload()
    }
  }

  /**
   * 处理内存不足（OOM）
   */
  private async handleOutOfMemory(): Promise<void> {
    this.logger.warn('[CrashRecovery] OOM 崩溃，清理内存后重载')

    // 强制垃圾回收（如果可用）
    if (global.gc) {
      global.gc()
      this.logger.info('[CrashRecovery] 已执行垃圾回收')
    }

    // 清理缓存
    if (this.window) {
      await this.window.webContents.session.clearCache()
      await this.window.webContents.session.clearStorageData({
        storages: ['shadercache', 'serviceworkers']
      })
    }

    await this.reload()
  }

  /**
   * 处理普通崩溃
   */
  private async handleCrashed(): Promise<void> {
    this.logger.warn('[CrashRecovery] 普通崩溃，直接重载')
    await this.reload()
  }

  /**
   * 处理被杀死
   */
  private async handleKilled(): Promise<void> {
    this.logger.warn('[CrashRecovery] 进程被杀死，等待 5 秒后重载')
    await new Promise(resolve => setTimeout(resolve, 5000))
    await this.reload()
  }

  /**
   * 处理无响应
   */
  private async handleUnresponsive(): Promise<void> {
    this.logger.warn('[CrashRecovery] 窗口无响应，等待 10 秒后强制重载')
    await new Promise(resolve => setTimeout(resolve, 10000))

    if (this.window && !this.window.isDestroyed()) {
      this.logger.info('[CrashRecovery] 强制重载')
      await this.reload()
    }
  }

  /**
   * 安全重载窗口
   */
  private async reload(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      this.logger.error('[CrashRecovery] 窗口已销毁，无法重载')
      return
    }

    // 限制最小刷新间隔
    const now = Date.now()
    if (now - this.lastReloadTime < this.minReloadInterval) {
      this.logger.warn('[CrashRecovery] 刷新间隔过短，等待中...')
      await new Promise(resolve => setTimeout(resolve, this.minReloadInterval))
    }

    this.lastReloadTime = now
    this.logger.info('[CrashRecovery] 触发刷新')

    try {
      this.window.reload()
    } catch (error) {
      this.logger.error('[CrashRecovery] 刷新失败:', error)
    }
  }

  /**
   * 调度重置计数器
   */
  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
    }

    this.resetTimer = setTimeout(() => {
      this.logger.info(`[CrashRecovery] 超时 (${this.resetTimeout / 1000}s)，重置计数器 (当前: ${this.crashRetryCount} → 0)`)
      this.crashRetryCount = 0
      this.resetTimer = null
    }, this.resetTimeout)
  }

  /**
   * 启动内存监控（预防性）
   */
  private startMemoryMonitor(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
    }

    // 每 60 秒检查一次进程内存
    this.memoryCheckInterval = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) {
        return
      }

      const processMemory = process.memoryUsage()
      const heapUsedMB = Math.round(processMemory.heapUsed / 1024 / 1024)
      const rssMB = Math.round(processMemory.rss / 1024 / 1024)

      // 内存使用超过 1GB，警告
      if (rssMB > 1024) {
        this.logger.warn(`[CrashRecovery] 内存使用过高: RSS=${rssMB}MB, Heap=${heapUsedMB}MB`)

        // 超过 1.5GB，预防性刷新
        if (rssMB > 1536 && this.crashRetryCount < 3) {
          this.logger.warn('[CrashRecovery] 内存超过 1.5GB，执行预防性刷新')
          this.crashRetryCount++
          this.scheduleReset()
          this.reload()
        }
      }
    }, 60000)
  }

  /**
   * 获取当前状态
   */
  getStatus(): { crashRetryCount: number; maxRetry: number; lastReloadTime: number } {
    return {
      crashRetryCount: this.crashRetryCount,
      maxRetry: this.maxRetry,
      lastReloadTime: this.lastReloadTime
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
    }
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
    }
    this.window = null
  }
}
