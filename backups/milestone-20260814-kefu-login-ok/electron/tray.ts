import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { LoggerService } from './services/logger.service'

let tray: Tray | null = null

export interface TrayHandlers {
  openKefu?: () => void
}

export function createTray(mainWindow: BrowserWindow, logger: LoggerService, handlers?: TrayHandlers) {
  const iconPath = join(__dirname, '../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  tray.setToolTip('小红书发货助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: '小红书后台',
      click: () => {
        mainWindow.webContents.send('navigate', '/browser')
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: '客服聊天',
      click: () => {
        handlers?.openKefu?.()
        mainWindow.webContents.send('navigate', '/auto-reply')
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: '关于',
      click: () => {
        mainWindow.webContents.send('navigate', '/settings')
        mainWindow.show()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        (app as any).isQuitting = true
        logger.info('用户通过托盘菜单退出')
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}
