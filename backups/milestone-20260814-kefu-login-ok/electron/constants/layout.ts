/** 与 Vue 布局一致的 BrowserView 区域常量 */
export const SIDEBAR_WIDTH = 180
export const TITLEBAR_HEIGHT = 36
export const STATUSBAR_HEIGHT = 28

export function calcBrowserViewBounds(winWidth: number, winHeight: number) {
  return {
    x: SIDEBAR_WIDTH,
    y: TITLEBAR_HEIGHT,
    width: Math.max(100, winWidth - SIDEBAR_WIDTH),
    height: Math.max(100, winHeight - TITLEBAR_HEIGHT - STATUSBAR_HEIGHT)
  }
}
