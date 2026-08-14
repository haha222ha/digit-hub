import type { WebContents } from 'electron'
import { LoggerService } from './logger.service'

type PendingAck = {
  resolve: (body: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * 通过 CDP 跟踪 zelda WebSocket 并发送帧（不依赖页面 hook 是否抓到 socket 实例）
 */
export class ImWsCdpService {
  private logger: LoggerService
  private wcId: number | null = null
  private zeldaRequestId: string | null = null
  private lastSeq = 0
  private pendingAcks = new Map<string, PendingAck>()
  private attached = false

  constructor(logger: LoggerService) {
    this.logger = logger
  }

  isReady() {
    return !!this.zeldaRequestId
  }

  getLastSeq() {
    return this.lastSeq
  }

  private parsePayload(data: unknown) {
    try {
      if (typeof data === 'string') return JSON.parse(data)
      if (Buffer.isBuffer(data)) return JSON.parse(data.toString('utf8'))
    } catch {
      /* ignore */
    }
    return null
  }

  private trackSeq(msg: { header?: { seq?: number } } | null) {
    const seq = msg?.header?.seq
    if (typeof seq === 'number') this.lastSeq = Math.max(this.lastSeq, seq)
  }

  private onCdpMessage(_method: string, params: Record<string, unknown>) {
    if (_method === 'Network.webSocketCreated') {
      const url = String(params.url || '')
      if (/zelda\.xiaohongshu\.com/i.test(url)) {
        this.zeldaRequestId = String(params.requestId || '')
        this.logger.info(`[ImWsCdp] zelda WS created requestId=${this.zeldaRequestId}`)
      }
      return
    }
    if (_method === 'Network.webSocketFrameReceived') {
      const reqId = String(params.requestId || '')
      if (this.zeldaRequestId && reqId !== this.zeldaRequestId) return
      const payload = (params.response as { payloadData?: string })?.payloadData
      if (!payload) return
      let text = payload
      try {
        text = Buffer.from(payload, 'base64').toString('utf8')
      } catch {
        /* keep raw */
      }
      const msg = this.parsePayload(text) as {
        header?: { type?: number; action?: string; traceId?: string; seq?: number }
        body?: { code?: number; msg?: string }
      } | null
      if (!msg?.header) return
      this.trackSeq(msg)
      const hdr = msg.header
      if (hdr.type === 131 && hdr.action === '/message/send' && hdr.traceId) {
        const pending = this.pendingAcks.get(hdr.traceId)
        if (!pending) return
        this.pendingAcks.delete(hdr.traceId)
        clearTimeout(pending.timer)
        const body = msg.body || {}
        if (body.code === 0) pending.resolve(body)
        else pending.reject(new Error(`${body.msg || 'send failed'} code=${body.code}`))
      }
      return
    }
    if (_method === 'Network.webSocketFrameSent') {
      const reqId = String(params.requestId || '')
      if (this.zeldaRequestId && reqId !== this.zeldaRequestId) return
      const payload = (params.response as { payloadData?: string })?.payloadData
      if (!payload) return
      let text = payload
      try {
        text = Buffer.from(payload, 'base64').toString('utf8')
      } catch {
        /* keep raw */
      }
      this.trackSeq(this.parsePayload(text))
    }
  }

  async attach(wc: WebContents): Promise<boolean> {
    if (!wc || wc.isDestroyed()) return false
    if (this.attached && this.wcId === wc.id && this.zeldaRequestId) return true

    await this.detach().catch(() => false)
    this.wcId = wc.id
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    } catch (e: unknown) {
      this.logger.warn(`[ImWsCdp] debugger attach fail: ${e}`)
      return false
    }

    wc.debugger.removeAllListeners('message')
    wc.debugger.on('message', (_event, method, params) => {
      this.onCdpMessage(method, params as Record<string, unknown>)
    })

    try {
      await wc.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize: 100000000,
        maxResourceBufferSize: 50000000
      })
    } catch (e: unknown) {
      this.logger.warn(`[ImWsCdp] Network.enable fail: ${e}`)
      return false
    }

    this.attached = true
    // 等待已有 zelda 连接或页面后续创建
    let deadline = Date.now() + 8000
    while (Date.now() < deadline && !this.zeldaRequestId) {
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!this.zeldaRequestId) {
      await wc
        .executeJavaScript(
          `(async function(){
            try {
              if (window.__xhsAssistant?.im?.connectAssistantZeldaWs) {
                await window.__xhsAssistant.im.connectAssistantZeldaWs(8000);
              }
            } catch (e) {}
            return true;
          })()`
        )
        .catch(() => false)
      deadline = Date.now() + 10000
      while (Date.now() < deadline && !this.zeldaRequestId) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    this.logger.info(
      `[ImWsCdp] attach wc=${wc.id} zelda=${this.zeldaRequestId || 'pending'} lastSeq=${this.lastSeq}`
    )
    return !!this.zeldaRequestId
  }

  async detach() {
    this.pendingAcks.forEach((p) => {
      clearTimeout(p.timer)
      p.reject(new Error('ImWsCdp detached'))
    })
    this.pendingAcks.clear()
    this.zeldaRequestId = null
    this.lastSeq = 0
    this.attached = false
    this.wcId = null
  }

  private waitAck(traceId: string, timeoutMs = 12000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(traceId)
        reject(new Error(`CDP WS /message/send 回执超时 traceId=${traceId}`))
      }, timeoutMs)
      this.pendingAcks.set(traceId, { resolve, reject, timer })
    })
  }

  async sendJson(wc: WebContents, frame: Record<string, unknown>): Promise<unknown> {
    if (!this.zeldaRequestId) {
      const ok = await this.attach(wc)
      if (!ok || !this.zeldaRequestId) throw new Error('CDP 未找到 zelda WebSocket')
    }
    const hdr = (frame.header || {}) as Record<string, unknown>
    const traceId = String(hdr.traceId || '')
    if (!traceId) throw new Error('frame.header.traceId 缺失')
    const ack = this.waitAck(traceId, 12000)
    const payload = JSON.stringify(frame)
    await wc.debugger.sendCommand('Network.sendWebSocketFrame', {
      requestId: this.zeldaRequestId,
      response: {
        opcode: 1,
        payloadData: Buffer.from(payload, 'utf8').toString('base64')
      }
    })
    if (typeof hdr.seq === 'number') this.lastSeq = Math.max(this.lastSeq, Number(hdr.seq))
    return ack
  }
}
