import { WebContents, session } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LoggerService } from './logger.service'

/**
 * JS 注入服务 — 对标 XhsJsFilter / CefEx
 */
export class InjectService {
  private logger: LoggerService
  private injectedScripts: Map<string, string> = new Map()
  private pendingJsInjectUrls: Set<string> = new Set()
  private onCsaHttpOk: ((url: string) => void) | null = null
  private hookedPartitions = new Set<string>()

  constructor(logger: LoggerService) {
    this.logger = logger
    this.loadScripts()
  }

  setCsaHttpOkHandler(handler: ((url: string) => void) | null) {
    this.onCsaHttpOk = handler
  }

  private loadScripts() {
    const scriptsDir = join(__dirname, '../resources/inject-scripts')
    const scripts = [
      { name: 'main-hook', file: 'main-hook.js' },
      { name: 'order-monitor', file: 'order-monitor.js' },
      { name: 'kefu-monitor', file: 'kefu-monitor.js' },
      { name: 'api-interceptor', file: 'api-interceptor.js' },
      { name: 'login-helper', file: 'login-helper.js' },
      { name: 'im-send', file: 'im-send.js' },
      { name: 'goods-sync', file: 'goods-sync.js' },
      { name: 'csbridge-diag', file: 'csbridge-diag.js' }
    ]

    for (const script of scripts) {
      try {
        const content = readFileSync(join(scriptsDir, script.file), 'utf8')
        this.injectedScripts.set(script.name, content)
        this.logger.info(`[Inject] 脚本已加载: ${script.name}`)
      } catch {
        this.logger.warn(`[Inject] 脚本不存在: ${script.file}，使用内联版本`)
        this.injectedScripts.set(script.name, this.getInlineScript(script.name))
      }
    }
  }

  /**
   * 设置请求拦截 — 近似 XhsJsFilter（监听 walle-eva JS 加载）
   */
  setupRequestInterception(partition = 'persist:main') {
    if (this.hookedPartitions.has(partition)) return
    this.hookedPartitions.add(partition)
    const ses = session.fromPartition(partition)

    // Electron 每个 session 只能挂一个 onBeforeRequest / onCompleted，必须合并监听
    ses.webRequest.onBeforeRequest(
      {
        urls: [
          '*://*.xhscdn.com/formula-static/walle-eva/*',
          '*://walle.xiaohongshu.com/*',
          '*://eva.xiaohongshu.com/*',
          '*://edith.xiaohongshu.com/*'
        ]
      },
      (details, callback) => {
        if (details.url.includes('formula-static/walle-eva') && details.url.endsWith('.js')) {
          this.pendingJsInjectUrls.add(details.url)
          this.logger.info(`[XhsJsFilter] 拦截 JS: ${details.url}`)
        }
        if (details.url.includes('/api/')) {
          this.logger.info(`[Inject] API 请求: ${details.url}`)
        }
        callback({})
      }
    )

    ses.webRequest.onCompleted(
      {
        urls: [
          '*://*.xhscdn.com/formula-static/walle-eva/*',
          '*://walle.xiaohongshu.com/*',
          '*://eva.xiaohongshu.com/*',
          '*://edith.xiaohongshu.com/*'
        ]
      },
      (details) => {
        if (
          details.url.includes('formula-static/walle-eva') &&
          details.url.endsWith('.js') &&
          details.statusCode === 200
        ) {
          this.logger.info(`[XhsJsFilter] ✅ JS 加载完成: ${details.url}`)
          this.pendingJsInjectUrls.delete(details.url)
        }
        if (details.url.includes('get_csa_info') && details.statusCode === 200) {
          this.logger.info(`[Inject] get_csa_info HTTP ${details.statusCode}`)
          this.onCsaHttpOk?.(details.url)
        }
      }
    )

    ses.webRequest.onHeadersReceived(
      { urls: ['*://*.xiaohongshu.com/*'] },
      (details, callback) => {
        const headers = details.responseHeaders || {}
        const setCookie = headers['set-cookie'] || headers['Set-Cookie']
        if (setCookie) {
          const joined = Array.isArray(setCookie) ? setCookie.join('\n') : String(setCookie)
          if (/walle-eva-auth|web_session|customer-shop-sid/i.test(joined)) {
            this.logger.info(`[Inject] Set-Cookie 含鉴权字段: ${details.url.slice(0, 100)}`)
          }
        }
        callback({ responseHeaders: headers })
      }
    )
  }

  /**
   * dom-ready：登录页只注入 api-interceptor 抠 token；工作台注入全套
   */
  injectOnDomReady(webContents: WebContents) {
    const url = webContents.getURL()
    if (!url.includes('xiaohongshu.com')) return
    this.injectScripts(webContents)
  }

  private isLoginPage(url: string): boolean {
    return url.includes('customer.xiaohongshu.com') ||
      url.includes('ark.xiaohongshu.com') ||
      url.includes('/login') ||
      url.includes('cstools/login')
  }

  /** 供 auto-login 显式调用 */
  async injectLoginHelper(webContents: WebContents): Promise<void> {
    if (webContents.isDestroyed()) return
    const script = this.injectedScripts.get('login-helper')
    if (!script) return
    try {
      await webContents.executeJavaScript(script)
      this.logger.info('[Inject] 脚本注入成功: login-helper')
    } catch (error) {
      this.logger.error('[Inject] 脚本注入失败: login-helper', error)
    }
  }

  injectScripts(webContents: WebContents) {
    const url = webContents.getURL()
    this.logger.info(`[Inject] 页面加载完成: ${url}`)

    const isLogin = this.isLoginPage(url)
    const isWalle = url.includes('walle.xiaohongshu.com')

    if (!isLogin) {
      this.executeScript(webContents, 'main-hook')
    }

    if (isLogin) {
      // 登录页只注入拦截器，用来抠 login token；禁止其它监控脚本
      if (isWalle) this.executeScript(webContents, 'api-interceptor')
      return
    }

    // api-interceptor 用于 walle 域（含工作台 / 登录后）
    if (isWalle) {
      this.executeScript(webContents, 'api-interceptor')
      this.executeScript(webContents, 'order-monitor')
      this.executeScript(webContents, 'im-send')
      this.executeScript(webContents, 'goods-sync')
    }

    // 千帆商家后台：商品同步（对标阿奇锁 getGoodsNoteList，必须在 ark 域）
    // 订单查询页同时注入 im-send，供隐藏窗轮询 fulfillment/order/page
    if (url.includes('ark.xiaohongshu.com') && !isLogin) {
      this.executeScript(webContents, 'api-interceptor')
      this.executeScript(webContents, 'goods-sync')
      if (/\/app-order\//i.test(url)) {
        this.executeScript(webContents, 'im-send')
      }
    }

    if (url.includes('/cstools/chat') || url.includes('kefu')) {
      this.executeScript(webContents, 'kefu-monitor')
      this.executeScript(webContents, 'im-send')
      this.executeScript(webContents, 'csbridge-diag')
    }
  }

  getScript(scriptName: string): string | undefined {
    return this.injectedScripts.get(scriptName)
  }

  /** 同步注入并等待完成；开发期每次从磁盘重读，避免热更后仍用旧脚本 */
  async injectScriptAsync(webContents: WebContents, scriptName: string): Promise<boolean> {
    try {
      const scriptsDir = join(__dirname, '../resources/inject-scripts')
      const fileMap: Record<string, string> = {
        'im-send': 'im-send.js',
        'goods-sync': 'goods-sync.js',
        'api-interceptor': 'api-interceptor.js',
        'csbridge-diag': 'csbridge-diag.js'
      }
      const file = fileMap[scriptName]
      if (file) {
        const content = readFileSync(join(scriptsDir, file), 'utf8')
        this.injectedScripts.set(scriptName, content)
      }
    } catch {
      /* keep cached */
    }
    const script = this.injectedScripts.get(scriptName)
    if (!script || webContents.isDestroyed()) return false
    let ok = false
    // 主帧优先：轮询/发货都读 top window.__xhsAssistant；只注入 iframe 会导致「IMSend 未就绪」
    try {
      await webContents.executeJavaScript(script)
      ok = true
    } catch {
      /* 主帧可能短暂不可执行，再试 subtree */
    }
    const frames = webContents.mainFrame?.framesInSubtree || []
    for (const frame of frames) {
      if (!frame || frame === webContents.mainFrame) continue
      try {
        await frame.executeJavaScript(script)
        ok = true
      } catch {
        /* 跨域 iframe 忽略 */
      }
    }
    if (ok) {
      this.logger.info(`[Inject] 脚本注入成功: ${scriptName} frames=${1 + frames.length}`)
    } else {
      this.logger.error(`[Inject] 脚本注入失败: ${scriptName}`)
    }
    return ok
  }

  private executeScript(webContents: WebContents, scriptName: string) {
    const script = this.injectedScripts.get(scriptName)
    if (!script) return

    webContents.executeJavaScript(script)
      .then(() => this.logger.info(`[Inject] 脚本注入成功: ${scriptName}`))
      .catch((error) => this.logger.error(`[Inject] 脚本注入失败: ${scriptName}`, error))
  }

  private getInlineScript(name: string): string {
    switch (name) {
      case 'main-hook':
        return `console.log('[XHS Assistant] 主钩子脚本已注入'); window.__xhsAssistant = { version: '1.0.0', apiEndpoint: 'http://127.0.0.1:19527' };`
      case 'api-interceptor':
        return `(function(){const o=window.fetch;window.fetch=function(...a){return o.apply(this,a).then(r=>{if(r.status===401)window.postMessage({type:'xhs-401-redirect',url:a[0]},'*');return r;});};})();`
      default:
        return `console.log('[XHS Assistant] 脚本: ${name}');`
    }
  }
}
