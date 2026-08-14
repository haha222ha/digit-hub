import WebSocket from 'ws'
import { BrowserWindow, session } from 'electron'
import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { partitionForShop } from '../utils/shop-partition'

/**
 * WebSocket 双通道
 * - 主通道（Agiso 云）：无授权时默认关闭，订单走 HTTP 轮询
 * - 客服通道（zelda）：仅在有客服鉴权 Cookie 后连接
 */
export class WebSocketService {
  private ws: WebSocket | null = null
  private kefuWs: WebSocket | null = null
  private logger: LoggerService
  private storage: StorageService
  private mainWindow: BrowserWindow | null = null

  private readonly DEFAULT_WS_URL = 'wss://xhsmsgwebsocket.agiso.com'
  private readonly KEFU_WS_URL = 'wss://zelda.xiaohongshu.com/websocketV2'
  private readonly RECONNECT_INTERVAL = 3000
  private readonly MAX_RECONNECT_DELAY = 30000
  private reconnectAttempts = 0
  private kefuReconnectAttempts = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private kefuHeartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private kefuReconnectTimer: NodeJS.Timeout | null = null
  private isManualClose = false
  /** P0：无阿奇云授权时默认不连主通道 */
  private agisoMainEnabled = false
  private kefuEnabled = true

  private status: 'Closed' | 'Connecting' | 'Open' = 'Closed'
  private kefuStatus: 'Closed' | 'Connecting' | 'Open' = 'Closed'
  private kefuLastSeq = 0
  private kefuPendingAcks = new Map<
    string,
    {
      resolve: (body: unknown) => void
      reject: (err: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(logger: LoggerService, storage: StorageService) {
    this.logger = logger
    this.storage = storage
    // 仅当用户显式开启 / 配置了非 Agiso 默认地址时才连主通道
    const configured = this.storage.get<string>('wsUrl')
    const forceAgiso = this.storage.get<boolean>('enableAgisoWs') === true
    this.agisoMainEnabled = forceAgiso || (!!configured && !configured.includes('agiso.com'))
  }

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  private getWsUrl(): string {
    const configured = this.storage.get<string>('wsUrl')
    return configured || this.DEFAULT_WS_URL
  }

  private emitStatusChange() {
    const payload = this.getStatus()
    this.mainWindow?.webContents.send('ws:status-changed', payload.main.status)
    this.mainWindow?.webContents.send('ws:status-detail', payload)
  }

  start() {
    if (this.agisoMainEnabled) {
      this.connectMain()
    } else {
      this.logger.info(
        '[WebSocket][Main] 已跳过 Agiso 主通道（无授权）。订单请走 HTTP 轮询；若需开启设 enableAgisoWs=true'
      )
      this.setStatus('Closed')
    }
    // zelda：等登录成功 / Phase2 reconnectKefu，启动时不连
  }

  private connectMain() {
    if (this.isManualClose || !this.agisoMainEnabled) return
    const url = this.getWsUrl()
    this.setStatus('Connecting')
    this.logger.info(`[WebSocketState][Main] 开始连接 ${url}...`)

    try {
      this.ws = new WebSocket(url, {
        perMessageDeflate: false,
        handshakeTimeout: 10000
      })
      this.ws.on('open', () => this.onOpen())
      this.ws.on('message', (data) => this.onMessage(data))
      this.ws.on('close', (code, reason) => this.onClose(code, reason.toString()))
      this.ws.on('error', (error) => this.onError(error))
    } catch (error) {
      this.logger.error('[WebSocket][Main] 连接异常:', error)
      this.scheduleReconnect()
    }
  }

  private onOpen() {
    this.reconnectAttempts = 0
    this.setStatus('Open')
    this.logger.info('[WebSocketState][Main] 连接已建立')
    this.startHeartbeat()
    this.emitStatusChange()
  }

  private onMessage(data: WebSocket.RawData) {
    try {
      const message = data.toString()
      this.logger.info(`[WebSocket][Main] 收到消息: ${message.substring(0, 200)}`)
      const parsed = JSON.parse(message)
      this.handleMessage(parsed)
    } catch (error) {
      this.logger.error('[WebSocket][Main] 消息解析失败:', error)
    }
  }

  private handleMessage(message: Record<string, unknown>) {
    const autoShipService = (global as any).autoShipService
    const type = message.type as string

    switch (type) {
      case 'new_order':
      case 'order': {
        const orderId = (message.orderId || message.order_id || '') as string
        this.logger.info(`[WebSocket][Main] 新订单: ${orderId}`)
        if (orderId && autoShipService) {
          autoShipService.handleNewOrder({
            order_id: orderId,
            status: 'paid',
            source: 'websocket'
          }).catch((err: Error) => this.logger.error('[WebSocket] 发货触发失败:', err))
        }
        break
      }
      case 'kefu_message':
      case 'chat_message':
        this.logger.info(`[WebSocket][Main] 客服消息: ${message.content}`)
        break
      case 'ship_result':
        this.logger.info(`[WebSocket][Main] 发货结果: ${message.status}`)
        break
      default:
        this.logger.info(`[WebSocket][Main] 未处理的消息类型: ${type}`)
    }
  }

  private onClose(code: number, reason: string) {
    this.setStatus('Closed')
    this.stopHeartbeat()
    this.logger.info(`[WebSocketState][Main] 连接已关闭 - code=${code}, reason=${reason}`)
    this.emitStatusChange()
    if (!this.isManualClose && this.agisoMainEnabled) this.scheduleReconnect()
  }

  private onError(error: Error) {
    this.logger.error('[WebSocket][Main] 连接错误:', error)
  }

  private scheduleReconnect() {
    if (!this.agisoMainEnabled) return
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const delay = Math.min(
      this.RECONNECT_INTERVAL * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY
    )
    this.reconnectAttempts++
    this.logger.info(`[WebSocket][Main] ${delay}ms 后重连（第 ${this.reconnectAttempts} 次）`)
    this.reconnectTimer = setTimeout(() => this.connectMain(), delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping()
    }, 25000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private setStatus(status: 'Closed' | 'Connecting' | 'Open') {
    const old = this.status
    this.status = status
    this.logger.info(`[WebSocketState][Main] Old=${old}, New=${status}`)
  }

  /** 从 Electron session 拼 Cookie（优先于过期存档） */
  private async buildLiveCookieHeader(): Promise<string> {
    try {
      const cookies = await session.fromPartition(partitionForShop()).cookies.get({})
      const xhs = cookies.filter((c) => /xiaohongshu\.com/i.test(String(c.domain || '')))
      if (!xhs.length) return ''
      return xhs.map((c) => `${c.name}=${c.value}`).join('; ')
    } catch {
      return ''
    }
  }

  private hasAuthInCookieHeader(header: string): boolean {
    return /walle-eva-auth=|web_session=|customer-shop-sid=/i.test(header)
  }

  private connectKefu() {
    if (this.isManualClose || !this.kefuEnabled) return
    this.setKefuStatus('Connecting')
    this.logger.info('[WebSocketState][Kefu] 开始连接 zelda...')

    void (async () => {
      try {
        const shopId = (global as any).currentShopId || 'default'
        let cookieHeader = await this.buildLiveCookieHeader()
        if (!cookieHeader) {
          cookieHeader = this.storage.getShopCookieHeader(shopId) || ''
        }
        if (!cookieHeader || !this.hasAuthInCookieHeader(cookieHeader)) {
          this.logger.warn('[WebSocket][Kefu] 无客服鉴权 Cookie，跳过 zelda（等登录成功后再连）')
          this.setKefuStatus('Closed')
          return
        }

        const tokenMatch = cookieHeader.match(/(?:walle-eva-auth|web_session|token)=([^;]+)/i)
        const token = tokenMatch ? tokenMatch[1] : ''

        const headers: Record<string, string> = {
          Cookie: cookieHeader,
          Origin: 'https://walle.xiaohongshu.com',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        if (token) headers.Authorization = `Bearer ${decodeURIComponent(token)}`

        this.kefuWs = new WebSocket(this.KEFU_WS_URL, {
          headers,
          perMessageDeflate: false,
          handshakeTimeout: 10000
        })
        this.kefuWs.on('open', () => this.onKefuOpen())
        this.kefuWs.on('message', (data) => this.onKefuMessage(data))
        this.kefuWs.on('close', (code, reason) => this.onKefuClose(code, reason.toString()))
        this.kefuWs.on('error', (error) => this.onKefuError(error))
      } catch (error) {
        this.logger.error('[WebSocket][Kefu] 连接异常:', error)
        this.scheduleKefuReconnect()
      }
    })()
  }

  private onKefuOpen() {
    this.kefuReconnectAttempts = 0
    this.setKefuStatus('Open')
    this.logger.info('[WebSocketState][Kefu] 小红书客服 WebSocket 连接已打开')
    this.startKefuHeartbeat()
    this.emitStatusChange()
  }

  private onKefuMessage(data: WebSocket.RawData) {
    try {
      const message = JSON.parse(data.toString()) as {
        header?: { type?: number; action?: string; traceId?: string; seq?: number }
        body?: { code?: number; msg?: string }
        type?: string
        action?: string
      }
      const hdr = message.header
      if (hdr && typeof hdr.seq === 'number') {
        this.kefuLastSeq = Math.max(this.kefuLastSeq, hdr.seq)
      }
      if (hdr?.type === 131 && hdr.action === '/message/send' && hdr.traceId) {
        const pending = this.kefuPendingAcks.get(hdr.traceId)
        if (pending) {
          clearTimeout(pending.timer)
          this.kefuPendingAcks.delete(hdr.traceId)
          const body = message.body || {}
          if (body.code === 0) pending.resolve(body)
          else pending.reject(new Error(`${body.msg || 'send failed'} code=${body.code}`))
        }
      }
      this.handleKefuMessage(message as Record<string, unknown>)
    } catch (error) {
      this.logger.error('[WebSocket][Kefu] 消息解析失败:', error)
    }
  }

  private handleKefuMessage(message: Record<string, unknown>) {
    const action = (message.type || message.action) as string
    switch (action) {
      case 'new_message':
      case 'chat_message':
        this.logger.info(`[WebSocket][Kefu] 新消息: ${message.content || ''}`)
        this.mainWindow?.webContents.send('kefu:new-message', message)
        break
      default:
        this.logger.info(`[WebSocket][Kefu] 消息类型: ${action}`)
    }
  }

  private onKefuClose(code: number, reason: string) {
    this.setKefuStatus('Closed')
    this.stopKefuHeartbeat()
    this.logger.info(`[WebSocketState][Kefu] 连接已关闭 - code=${code}, reason=${reason}`)
    this.emitStatusChange()
    if (!this.isManualClose) this.scheduleKefuReconnect()
  }

  private onKefuError(error: Error) {
    this.logger.error('[WebSocket][Kefu] 连接错误:', error)
  }

  private scheduleKefuReconnect() {
    if (this.kefuReconnectTimer) clearTimeout(this.kefuReconnectTimer)
    const delay = Math.min(
      this.RECONNECT_INTERVAL * Math.pow(2, this.kefuReconnectAttempts),
      this.MAX_RECONNECT_DELAY
    )
    this.kefuReconnectAttempts++
    this.kefuReconnectTimer = setTimeout(() => this.connectKefu(), delay)
  }

  private startKefuHeartbeat() {
    this.stopKefuHeartbeat()
    this.kefuHeartbeatTimer = setInterval(() => {
      if (this.kefuWs?.readyState === WebSocket.OPEN) {
        this.kefuWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }
    }, 25000)
  }

  private stopKefuHeartbeat() {
    if (this.kefuHeartbeatTimer) {
      clearInterval(this.kefuHeartbeatTimer)
      this.kefuHeartbeatTimer = null
    }
  }

  private setKefuStatus(status: 'Closed' | 'Connecting' | 'Open') {
    const old = this.kefuStatus
    this.kefuStatus = status
    this.logger.info(`[WebSocketState][Kefu] Old=${old}, New=${status}`)
  }

  reconnectKefu() {
    this.kefuWs?.close()
    this.kefuWs = null
    this.kefuReconnectAttempts = 0
    this.connectKefu()
  }

  getStatus() {
    return {
      status: this.status,
      reconnectAttempts: this.reconnectAttempts,
      url: this.getWsUrl(),
      main: {
        status: this.status,
        reconnectAttempts: this.reconnectAttempts,
        url: this.getWsUrl(),
        enabled: this.agisoMainEnabled
      },
      kefu: {
        status: this.kefuStatus,
        reconnectAttempts: this.kefuReconnectAttempts,
        url: this.KEFU_WS_URL,
        enabled: this.kefuEnabled
      }
    }
  }

  reconnect() {
    this.isManualClose = false
    if (!this.agisoMainEnabled) {
      this.logger.info('[WebSocket][Main] Agiso 主通道未启用，忽略 reconnect')
      return
    }
    this.ws?.close()
    this.connectMain()
  }

  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return true
    }
    return false
  }

  sendKefu(message: unknown) {
    if (this.kefuWs?.readyState === WebSocket.OPEN) {
      this.kefuWs.send(JSON.stringify(message))
      return true
    }
    return false
  }

  private b64NoPad(str: string): string {
    return Buffer.from(str, 'utf8').toString('base64').replace(/=+$/, '')
  }

  buildAppCid(buyerId: string, csProviderId: string): string {
    const buyerUid = `1#2#2#${buyerId}`
    const sellerUid = `1#3#6#${csProviderId}`
    return `$3$${this.b64NoPad(buyerUid)}.${this.b64NoPad(sellerUid)}`
  }

  private randomHex32(): string {
    let s = ''
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
  }

  private randomTraceId(): string {
    return `cfffd${this.randomHex32().slice(5)}`
  }

  private randomSMid(): string {
    return `${this.randomHex32().slice(0, 13)}-${Date.now().toString(16).slice(-10)}`
  }

  private randomTextUuid(): string {
    return `text-${this.randomHex32().slice(0, 13)}-${Date.now().toString(16).slice(-10)}`
  }

  private randomUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  async ensureKefuOpen(timeoutMs = 15000): Promise<boolean> {
    if (this.kefuWs?.readyState === WebSocket.OPEN) return true
    this.reconnectKefu()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.kefuWs?.readyState === WebSocket.OPEN) return true
      await new Promise((r) => setTimeout(r, 250))
    }
    return this.kefuWs?.readyState === WebSocket.OPEN
  }

  private waitKefuAck(traceId: string, timeoutMs = 12000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.kefuPendingAcks.delete(traceId)
        reject(new Error(`主进程 zelda WS /message/send 回执超时 traceId=${traceId}`))
      }, timeoutMs)
      this.kefuPendingAcks.set(traceId, { resolve, reject, timer })
    })
  }

  async sendImpaasText(
    content: string,
    buyerId: string,
    csProviderId: string
  ): Promise<{ appCid: string }> {
    const open = await this.ensureKefuOpen(18000)
    if (!open) throw new Error('主进程 zelda WebSocket 未连接')
    const appCid = this.buildAppCid(buyerId, csProviderId)
    const traceId = this.randomTraceId()
    const seq = this.kefuLastSeq + 1
    const frame = {
      header: {
        sTime: Date.now(),
        seq,
        type: 3,
        bizId: 10,
        contentType: 'json',
        traceId,
        action: '/message/send',
        serviceId: 'impaas.oi',
        oneWay: false,
        sMid: this.randomSMid()
      },
      body: {
        appCid,
        convType: 1,
        uuid: this.randomTextUuid(),
        receiverAppUids: [`1#2#2#${buyerId}`],
        contentInfo: { contentType: 1, content: String(content) },
        convCreateIsSelfVisible: true,
        convRedPointIsNotSelfClear: true,
        extension: {
          additionInfo: JSON.stringify({ uuid: this.randomUuid(), sendMsgDoubleCheck: false })
        },
        callbackCtx: {}
      }
    }
    const ackPromise = this.waitKefuAck(traceId, 12000)
    if (!this.sendKefu(frame)) throw new Error('主进程 zelda WebSocket send 失败')
    this.kefuLastSeq = seq
    await ackPromise
    return { appCid }
  }

  stop() {
    this.isManualClose = true
    this.stopHeartbeat()
    this.stopKefuHeartbeat()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.kefuReconnectTimer) clearTimeout(this.kefuReconnectTimer)
    this.ws?.close()
    this.kefuWs?.close()
    this.ws = null
    this.kefuWs = null
    this.setStatus('Closed')
    this.setKefuStatus('Closed')
  }
}
