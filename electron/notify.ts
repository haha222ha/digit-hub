import { Notification } from 'electron'

/** 桌面通知（发货成功/失败、库存不足） */
export function notifyDesktop(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body, silent: false })
    n.show()
  } catch {
    /* 无控制台环境忽略 */
  }
}
