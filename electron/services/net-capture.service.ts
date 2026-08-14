import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { WebContents } from 'electron'
import { LoggerService } from './logger.service'

type CaptureEntry = {
  at: string
  kind: string
  url?: string
  method?: string
  status?: number
  requestId?: string
  postData?: string
  responseBody?: string
  wsPayload?: string
  wsOpcode?: number
  note?: string
}

const IM_URL_RE =
  /edith\/mcs|search_customer|get_csa|chat|conv|session|zelda|websocket|send|message|mcs\//i

/**
 * CDP Network 抓包 — 对标 F12 Network（HTTP + WebSocket 帧）
 */
export class NetCaptureService {
  private logger: LoggerService
  private activeWcId: number | null = null
  private logFile = ''
  private entries: CaptureEntry[] = []
  private pendingBodies = new Map<string, { method: string; url: string; postData?: string }>()
  private hooked = false

  constructor(logger: LoggerService) {
    this.logger = logger
  }

  isActive() {
    return this.activeWcId != null
  }

  getLogFile() {
    return this.logFile
  }

  getEntryCount() {
    return this.entries.length
  }

  private shouldLog(url: string) {
    return IM_URL_RE.test(url) || /walle\.xiaohongshu\.com\/api\//i.test(url)
  }

  private push(entry: CaptureEntry) {
    this.entries.push(entry)
    if (this.entries.length > 5000) this.entries.shift()
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf8')
      } catch {
        /* ignore */
      }
    }
  }

  async start(wc: WebContents, tag = 'manual-chat'): Promise<{ ok: boolean; logFile: string; error?: string }> {
    if (!wc || wc.isDestroyed()) {
      return { ok: false, logFile: '', error: 'WebContents 不可用' }
    }
    await this.stop().catch(() => false)

    const dir = join(process.env.APPDATA || '', 'xhs-shipping-assistant', 'captures')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.logFile = join(dir, `${tag}-${ts}.ndjson`)
    writeFileSync(
      this.logFile,
      JSON.stringify({ type: 'meta', at: new Date().toISOString(), tag, wcUrl: wc.getURL() }) + '\n',
      'utf8'
    )
    this.entries = []
    this.pendingBodies.clear()
    this.activeWcId = wc.id

    try {
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3')
      }
    } catch (e: any) {
      return { ok: false, logFile: '', error: e?.message || String(e) }
    }

    if (!this.hooked) {
      this.hooked = true
    }
    wc.debugger.removeAllListeners('message')
    wc.debugger.on('message', (_event, method, params) => {
      void this.onCdpMessage(wc, method, params as Record<string, any>)
    })
    wc.debugger.removeAllListeners('detach')
    wc.debugger.on('detach', (_event, reason) => {
      this.logger.warn(`[NetCapture] debugger detach: ${reason}`)
      if (this.activeWcId === wc.id) this.activeWcId = null
    })

    try {
      await wc.debugger.sendCommand('Network.enable', {
        maxTotalBufferSize: 100000000,
        maxResourceBufferSize: 50000000
      })
    } catch (e: any) {
      return { ok: false, logFile: this.logFile, error: e?.message || String(e) }
    }

    this.logger.info(`[NetCapture] 已开始 tag=${tag} file=${this.logFile}`)
    return { ok: true, logFile: this.logFile }
  }

  private async onCdpMessage(wc: WebContents, method: string, params: Record<string, any>) {
    if (this.activeWcId !== wc.id) return

    if (method === 'Network.requestWillBeSent') {
      const url = String(params.request?.url || '')
      if (!this.shouldLog(url)) return
      const requestId = String(params.requestId || '')
      this.pendingBodies.set(requestId, {
        method: String(params.request?.method || 'GET'),
        url,
        postData: params.request?.postData || ''
      })
      this.push({
        at: new Date().toISOString(),
        kind: 'http-request',
        requestId,
        method: params.request?.method,
        url,
        postData: (params.request?.postData || '').slice(0, 8000)
      })
      return
    }

    if (method === 'Network.responseReceived') {
      const url = String(params.response?.url || '')
      if (!this.shouldLog(url)) return
      this.push({
        at: new Date().toISOString(),
        kind: 'http-response',
        requestId: String(params.requestId || ''),
        url,
        status: params.response?.status,
        note: params.response?.mimeType
      })
      return
    }

    if (method === 'Network.loadingFinished') {
      const requestId = String(params.requestId || '')
      const meta = this.pendingBodies.get(requestId)
      if (!meta || !this.shouldLog(meta.url)) return
      try {
        const body = (await wc.debugger.sendCommand('Network.getResponseBody', { requestId })) as {
          body?: string
          base64Encoded?: boolean
        }
        let text = body.body || ''
        if (body.base64Encoded) {
          text = `[base64 ${text.length} chars]`
        }
        this.push({
          at: new Date().toISOString(),
          kind: 'http-body',
          requestId,
          url: meta.url,
          method: meta.method,
          responseBody: text.slice(0, 12000)
        })
      } catch {
        /* body not available */
      } finally {
        this.pendingBodies.delete(requestId)
      }
      return
    }

    if (method === 'Network.webSocketCreated') {
      const url = String(params.url || '')
      if (!/zelda|websocket|xiaohongshu/i.test(url)) return
      this.push({ at: new Date().toISOString(), kind: 'ws-open', url })
      return
    }

    if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
      const payload = String(params.response?.payloadData || '')
      if (!payload || payload.length > 20000) return
      this.push({
        at: new Date().toISOString(),
        kind: method === 'Network.webSocketFrameSent' ? 'ws-send' : 'ws-recv',
        wsPayload: payload.slice(0, 12000),
        wsOpcode: params.response?.opcode,
        note: String(params.response?.mask ? 'masked' : '')
      })
    }
  }

  async stop(): Promise<{ ok: boolean; logFile: string; count: number }> {
    const file = this.logFile
    const count = this.entries.length
    this.activeWcId = null
    this.logFile = ''
    return { ok: true, logFile: file, count }
  }
}
