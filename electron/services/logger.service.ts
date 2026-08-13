import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

/**
 * 日志服务 — 仅写文件 + 内存，绝不调用 console
 * （Electron 无控制台时 console.log 会异步抛 EPIPE 打崩主进程）
 */
export class LoggerService {
  private logDir: string
  private recentLogs: string[] = []
  private maxRecentLogs = 1000

  constructor() {
    this.logDir = join(app.getPath('userData'), 'Logs')
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  private getLogFilePath(shopId?: string): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    if (shopId) {
      const shopDir = join(this.logDir, shopId)
      if (!fs.existsSync(shopDir)) {
        fs.mkdirSync(shopDir, { recursive: true })
      }
      return join(shopDir, `${date}.log`)
    }
    return join(this.logDir, `${date}.log`)
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
    let version = '1.0.0'
    try {
      version = app.getVersion()
    } catch {
      // app 尚未 ready
    }
    return `[${timestamp}]\t[v${version}]\t[${level}] ${message}`
  }

  private write(level: string, message: string, shopId?: string) {
    const formatted = this.formatMessage(level, message)

    this.recentLogs.push(formatted)
    if (this.recentLogs.length > this.maxRecentLogs) {
      this.recentLogs.shift()
    }

    try {
      fs.appendFileSync(this.getLogFilePath(shopId), formatted + '\n', 'utf8')
    } catch {
      // 静默失败，绝不 console
    }
  }

  info(message: string, shopId?: string) {
    this.write('Information', message, shopId)
  }

  warn(message: string, shopId?: string) {
    this.write('Warning', message, shopId)
  }

  error(message: string, error?: unknown, shopId?: string) {
    const errorMsg = error instanceof Error
      ? `${message}: ${error.message}`
      : typeof error === 'object' && error !== null
        ? `${message}: ${JSON.stringify(error)}`
        : message
    this.write('Error', errorMsg, shopId)
  }

  getRecentLogs(lines: number = 100): string[] {
    return this.recentLogs.slice(-lines)
  }

  clearRecentLogs() {
    this.recentLogs = []
  }
}
