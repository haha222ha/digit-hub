import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import { LoggerService } from './logger.service'

/**
 * 自动更新服务
 * - 对标原版 SoftwareInfo 定时监听（间隔 300s）
 */
export class UpdateService {
  private logger: LoggerService
  private checkInterval = 300 * 1000 // 300秒
  private timer: NodeJS.Timeout | null = null

  constructor(logger: LoggerService) {
    this.logger = logger
    this.setupAutoUpdater()
  }

  private setupAutoUpdater() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.logger.info('[Update] 正在检查更新...')
    })

    autoUpdater.on('update-available', (info) => {
      this.logger.info(`[Update] 发现新版本: ${info.version}`)
      // 通知前端
      this.notifyRenderer('update:available', info)
    })

    autoUpdater.on('update-not-available', () => {
      this.logger.info('[Update] 当前版本已是最新')
    })

    autoUpdater.on('error', (err) => {
      this.logger.error('[Update] 更新错误:', err)
    })

    autoUpdater.on('download-progress', (progress) => {
      this.logger.info(`[Update] 下载进度: ${progress.percent.toFixed(1)}%`)
    })

    autoUpdater.on('update-downloaded', () => {
      this.logger.info('[Update] 更新已下载完成')
      this.notifyRenderer('update:downloaded', null)
    })
  }

  private notifyRenderer(channel: string, data: unknown) {
    const { BrowserWindow } = require('electron')
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      win.webContents.send(channel, data)
    }
  }

  async checkForUpdates(): Promise<boolean> {
    try {
      await autoUpdater.checkForUpdates()
      return true
    } catch (error) {
      this.logger.error('[Update] 检查更新失败:', error)
      return false
    }
  }

  async downloadUpdate(): Promise<boolean> {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch (error) {
      this.logger.error('[Update] 下载更新失败:', error)
      return false
    }
  }

  installUpdate() {
    autoUpdater.quitAndInstall()
  }

  /**
   * 启动定时检查
   */
  startPeriodicCheck() {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      this.checkForUpdates()
    }, this.checkInterval)
    this.logger.info(`[SoftwareInfo] 定时监听已启动，间隔: ${this.checkInterval / 1000}s`)
  }

  stopPeriodicCheck() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}