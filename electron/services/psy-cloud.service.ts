/**
 * 心象测云端对接：登录 / 测题列表 / 发卡库存 / 原子领取链接
 */
import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { randomUUID } from 'crypto'

const CFG_BASE = 'psyCloudBaseUrl'
const CFG_TOKEN = 'psyCloudToken'
const CFG_USER = 'psyCloudUsername'
const CFG_CLIENT = 'psyCloudClientId'

export type PsyTestItem = {
  test_code: string
  test_name?: string
  name?: string
  question_count?: number
}

export type PsyInventory = {
  test_code: string
  unclaimed_unused: number
  claimed_unused: number
  used: number
  revoked?: number
  expired?: number
  total?: number
}

export type PsyClaimResult = {
  success: boolean
  message?: string
  claimed?: number
  batchId?: string
  urls?: string[]
  remaining_unclaimed?: number
  inventory?: PsyInventory
}

function unwrapData(body: any): any {
  if (!body || typeof body !== 'object') return body
  if (body.data != null) return body.data
  return body
}

export class PsyCloudService {
  constructor(
    private storage: StorageService,
    private logger: LoggerService
  ) {}

  getBaseUrl(): string {
    const u = String(this.storage.get<string>(CFG_BASE) || '').trim()
    return (u || 'https://psy.xhs365.cn').replace(/\/+$/, '')
  }

  getToken(): string {
    return String(this.storage.get<string>(CFG_TOKEN) || '').trim()
  }

  getClientId(): string {
    let id = String(this.storage.get<string>(CFG_CLIENT) || '').trim()
    if (!id) {
      id = `shipping-${randomUUID().slice(0, 8)}`
      this.storage.set(CFG_CLIENT, id, false)
    }
    return id
  }

  getStatus(): { configured: boolean; baseUrl: string; username: string; hasToken: boolean } {
    return {
      configured: !!this.getToken(),
      baseUrl: this.getBaseUrl(),
      username: String(this.storage.get<string>(CFG_USER) || ''),
      hasToken: !!this.getToken()
    }
  }

  setConfig(opts: { baseUrl?: string; token?: string; username?: string }): void {
    if (opts.baseUrl != null) this.storage.set(CFG_BASE, String(opts.baseUrl).trim().replace(/\/+$/, '') || 'https://psy.xhs365.cn')
    if (opts.token != null) this.storage.set(CFG_TOKEN, String(opts.token).trim(), true)
    if (opts.username != null) this.storage.set(CFG_USER, String(opts.username).trim())
  }

  clearAuth(): void {
    this.storage.set(CFG_TOKEN, '', true)
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${this.getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined)
    }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...init, headers })
    const text = await res.text()
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { message: text }
    }
    if (!res.ok) {
      const msg = body?.message || body?.detail || `HTTP ${res.status}`
      throw new Error(String(msg))
    }
    if (body && typeof body === 'object' && body.success === false) {
      throw new Error(String(body.message || '请求失败'))
    }
    return body
  }

  async login(username: string, password: string): Promise<{ success: boolean; message?: string; username?: string; token?: string }> {
    const user = (username || '').trim()
    if (!user || !password) return { success: false, message: '请输入用户名和密码' }
    try {
      const body = await this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: user, password, usernameOrEmail: user })
      })
      const data = unwrapData(body)
      // 优先长久对接 token；否则退回会话 JWT（兼容旧云端）
      const integ = String(data?.integration_token || data?.api_token || '').trim()
      const session = String(data?.token || '').trim()
      const token = integ || session
      if (!token) return { success: false, message: '登录成功但未返回 token' }
      this.setConfig({ token, username: user })
      this.logger.info(`[PsyCloud] 登录成功 user=${user} via=${integ ? 'integration_token' : 'session_jwt'}`)
      return { success: true, username: user, token }
    } catch (e: any) {
      this.logger.warn(`[PsyCloud] 登录失败: ${e?.message || e}`)
      return { success: false, message: e?.message || '登录失败' }
    }
  }

  /** 已有会话 JWT 时，拉取/确保长久对接 token 并落盘 */
  async ensureIntegrationToken(): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
      const body = await this.request('/api/auth/integration-token')
      const data = unwrapData(body)
      const token = String(data?.integration_token || data?.token || '').trim()
      if (!token) return { success: false, message: '未返回对接 token' }
      this.setConfig({ token })
      return { success: true, token }
    } catch (e: any) {
      return { success: false, message: e?.message || '获取对接 token 失败' }
    }
  }

  async listTests(): Promise<{ success: boolean; tests: PsyTestItem[]; message?: string }> {
    try {
      const body = await this.request('/api/tests/list')
      const data = unwrapData(body)
      const tests = (data?.tests || data || []) as PsyTestItem[]
      return { success: true, tests: Array.isArray(tests) ? tests : [] }
    } catch (e: any) {
      return { success: false, tests: [], message: e?.message || '获取测题失败' }
    }
  }

  async inventory(testCode: string): Promise<{ success: boolean; inventory?: PsyInventory; message?: string }> {
    const tc = (testCode || '').trim()
    if (!tc) return { success: false, message: '缺少测题代码' }
    try {
      const body = await this.request(`/api/faka/inventory?testCode=${encodeURIComponent(tc)}`)
      const data = unwrapData(body) as PsyInventory
      return { success: true, inventory: data }
    } catch (e: any) {
      return { success: false, message: e?.message || '获取库存失败' }
    }
  }

  async claimLinks(opts: {
    testCode: string
    count: number
    productId?: string
    shopId?: string
  }): Promise<PsyClaimResult> {
    const tc = (opts.testCode || '').trim()
    const count = Math.max(1, Math.min(200, Number(opts.count) || 1))
    if (!tc) return { success: false, message: '缺少测题代码' }
    if (!this.getToken()) return { success: false, message: '请先在设置中登录心象测' }
    try {
      const body = await this.request('/api/faka/claim-links', {
        method: 'POST',
        body: JSON.stringify({
          testCode: tc,
          count,
          clientId: this.getClientId(),
          productId: opts.productId || '',
          shopId: opts.shopId || ''
        })
      })
      const data = unwrapData(body)
      const links = (data?.links || []) as Array<{ url?: string; token?: string; test_code?: string }>
      const urls = links
        .map((l) => String(l.url || '').trim())
        .filter(Boolean)
      return {
        success: true,
        message: body?.message || `已领取 ${urls.length} 条`,
        claimed: Number(data?.claimed ?? urls.length),
        batchId: String(data?.batchId || data?.batch_id || ''),
        urls,
        remaining_unclaimed: Number(data?.remaining_unclaimed ?? 0),
        inventory: data?.inventory
      }
    } catch (e: any) {
      return { success: false, message: e?.message || '领取失败' }
    }
  }

  async releaseBatch(batchId: string): Promise<{ success: boolean; released?: number; message?: string }> {
    const batch = (batchId || '').trim()
    if (!batch) return { success: false, message: '缺少 batchId' }
    try {
      const body = await this.request('/api/faka/release-links', {
        method: 'POST',
        body: JSON.stringify({ batchId: batch })
      })
      const data = unwrapData(body)
      return { success: true, released: Number(data?.released || 0), message: body?.message }
    } catch (e: any) {
      return { success: false, message: e?.message || '释放失败' }
    }
  }

  /**
   * 领取并写入本地卡密池
   */
  async claimIntoPool(bindingId: number, testCode: string, count: number, productId?: string): Promise<PsyClaimResult & { added?: number }> {
    const claim = await this.claimLinks({ testCode, count, productId, shopId: 'default' })
    if (!claim.success) return claim
    const urls = claim.urls || []
    if (!urls.length) {
      return { ...claim, added: 0, message: claim.message || '云端无可领取链接' }
    }
    const added = this.storage.addCardPool(bindingId, urls, { skipDuplicate: true })
    this.logger.info(`[PsyCloud] claimIntoPool binding=${bindingId} claimed=${urls.length} added=${added}`)
    return {
      ...claim,
      added,
      message: `云端领取 ${urls.length} 条，本地新增 ${added} 条（去重跳过 ${urls.length - added}）`
    }
  }
}
