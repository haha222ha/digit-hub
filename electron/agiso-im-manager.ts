/**
 * 对标阿奇索历史版 AldsMsgManager.SendMsg + WinManager.XhsImWebContents
 * 主进程 executeJavaScript('window.sendImTextMsg(base64, orderId)')
 */
import type { WebContents } from 'electron'
import { LoggerService } from './services/logger.service'

const SEND_TIMEOUT_MS = 15000
const PAGE_LOADING = '页面加载中'
const NO_FUNC = 'window.sendImTextMsg is not a function'

export type AgisoSendResult = {
  ok: boolean
  error: string
  forceReQueue: boolean
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 等待超时`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

export class AgisoImManager {
  private readonly imByShop = new Map<string, WebContents>()
  private readonly logger: LoggerService

  constructor(logger: LoggerService) {
    this.logger = logger
  }

  bindXhsImWebContents(shopId: string, wc: WebContents) {
    const sid = String(shopId || '').trim()
    if (!sid || !wc || wc.isDestroyed()) return
    this.imByShop.set(sid, wc)
    wc.on('destroyed', () => {
      if (this.imByShop.get(sid)?.id === wc.id) this.imByShop.delete(sid)
    })
    wc.on('did-navigate-in-page', () => {
      if (!wc.isDestroyed()) wc.send('on:inPageNavigated')
    })
    this.logger.info(`[AgisoIM] 绑定 XhsImWebContents shop=${sid} wc=${wc.id}`)
  }

  unbindShop(shopId: string) {
    this.imByShop.delete(String(shopId || '').trim())
  }

  getXhsImWebContents(shopId: string): WebContents | null {
    const wc = this.imByShop.get(String(shopId || '').trim())
    return wc && !wc.isDestroyed() ? wc : null
  }

  /**
   * 1:1 对标阿奇索 SendMsg：Buffer base64 → executeJavaScript window.sendImTextMsg
   */
  async sendImTextMsg(
    shopId: string,
    orderId: string,
    content: string,
    opts?: { timeoutMs?: number }
  ): Promise<AgisoSendResult> {
    const wc = this.getXhsImWebContents(shopId)
    if (!wc) {
      return { ok: false, error: '当前用户未登录小红书IM', forceReQueue: false }
    }

    const timeoutMs = opts?.timeoutMs ?? SEND_TIMEOUT_MS
    const base64 = Buffer.from(content, 'utf-8').toString('base64')
    const safeOrderId = String(orderId).replace(/'/g, "\\'")
    const safeB64 = base64.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

    const js = `
      (async function(){
        try {
          if (typeof window.sendImTextMsg !== 'function') return 'window.sendImTextMsg is not a function';
          return await window.sendImTextMsg('${safeB64}','${safeOrderId}');
        } catch (error) {
          return error && error.message ? error.message : String(error);
        }
      })()
    `

    let raw: unknown
    try {
      raw = await withTimeout(wc.executeJavaScript(js), timeoutMs, '发送Im消息')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const isTimeout = /等待超时|timeout/i.test(msg)
      return {
        ok: false,
        error: isTimeout ? '发送Im消息超时' : msg,
        forceReQueue: false,
      }
    }

    const err = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
    if (err === '') {
      this.logger.info(`[AgisoIM] 发码成功 shop=${shopId} order=${orderId}`)
      return { ok: true, error: '', forceReQueue: false }
    }

    const forceReQueue = err === PAGE_LOADING || err === NO_FUNC
    if (forceReQueue) {
      this.logger.warn(`[AgisoIM] IM 页未就绪，将重试 shop=${shopId} order=${orderId}: ${err}`)
    } else {
      this.logger.warn(`[AgisoIM] 发码失败 shop=${shopId} order=${orderId}: ${err}`)
    }
    return { ok: false, error: err, forceReQueue }
  }

  async probe(shopId: string): Promise<Record<string, unknown>> {
    const wc = this.getXhsImWebContents(shopId)
    if (!wc) return { ok: false, error: 'no XhsImWebContents' }
    return wc.executeJavaScript(`({
      url: location.href,
      hasSendImTextMsg: typeof window.sendImTextMsg === 'function',
      hasXhsRim: !!(window.XhsRim && window.XhsRim.sendTextMsg),
      hasImLoginInfo: !!(window.ImLoginInfo && window.ImLoginInfo.csProviderId),
      csProviderId: (window.ImLoginInfo && window.ImLoginInfo.csProviderId) || '',
      farmerChatApp: !!document.querySelector('.farmer-chat-app'),
    })`) as Promise<Record<string, unknown>>
  }
}
