/**
 * 链接卡自动补货：云端额度不足时先 generate，再 claim 导入本地池，并通知前端刷新。
 */
import { BrowserWindow } from 'electron'
import { LoggerService } from './logger.service'
import { StorageService } from './storage.service'
import { PsyCloudService } from './psy-cloud.service'

export type ReplenishEvent = {
  bindingId: number
  productId: string
  testCode: string
  generated: number
  claimed: number
  added: number
  stock: number
  message: string
}

export class AutoReplenishService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastRunByPool = new Map<string, number>()
  private mainWindow: BrowserWindow | null = null

  constructor(
    private storage: StorageService,
    private psy: PsyCloudService,
    private logger: LoggerService
  ) {}

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  start(intervalMs = 60_000) {
    this.stop()
    const tick = async () => {
      try {
        await this.tickOnce()
      } catch (e) {
        this.logger.warn(`[AutoReplenish] tick 异常: ${e}`)
      }
    }
    void tick()
    this.timer = setInterval(tick, Math.max(30_000, intervalMs))
    this.logger.info(`[AutoReplenish] 已启动，巡检间隔 ${Math.max(30_000, intervalMs)}ms`)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private emit(evt: ReplenishEvent) {
    try {
      this.mainWindow?.webContents.send('psy:auto-replenish', evt)
    } catch {
      /* ignore */
    }
  }

  /** 手动补货一条绑定（UI「立即补货」） */
  async replenishBinding(bindingId: number): Promise<ReplenishEvent> {
    const row = this.storage.getAllProductBindings().find((b: any) => Number(b.id) === Number(bindingId))
    if (!row) {
      return {
        bindingId,
        productId: '',
        testCode: '',
        generated: 0,
        claimed: 0,
        added: 0,
        stock: 0,
        message: '绑定不存在'
      }
    }
    return this.replenishOne(row as any, true)
  }

  async tickOnce(): Promise<void> {
    if (this.running) return
    if (!this.psy.getToken()) return
    this.running = true
    try {
      const rows = (this.storage.getAllProductBindings() || []).filter(
        (b: any) =>
          String(b.deliver_type) === 'link_card' &&
          Number(b.auto_replenish_enabled) === 1 &&
          String(b.psy_test_code || '').trim() &&
          Number(b.enabled) !== 0
      )
      // 同一测题池只处理一次
      const seen = new Set<string>()
      for (const row of rows) {
        const pool = String(row.pool_key || `psy:${row.psy_test_code}`).trim()
        if (seen.has(pool)) continue
        seen.add(pool)
        await this.replenishOne(row as any, false)
      }
    } finally {
      this.running = false
    }
  }

  private async replenishOne(row: any, force: boolean): Promise<ReplenishEvent> {
    const bindingId = Number(row.id)
    const productId = String(row.product_id || '')
    const testCode = String(row.psy_test_code || '').trim()
    const threshold = Math.max(0, Number(row.auto_replenish_threshold ?? row.low_stock_alert ?? 10))
    const count = Math.max(1, Math.min(50, Number(row.auto_replenish_count ?? 20)))
    const intervalSec = Math.max(60, Number(row.auto_replenish_interval_sec ?? 300))
    const poolKey = String(row.pool_key || `psy:${testCode}`).trim()
    const stats = this.storage.getCardPoolStats(bindingId)
    const localUnused = Number(stats?.unused ?? row.stock ?? 0)

    const base: ReplenishEvent = {
      bindingId,
      productId,
      testCode,
      generated: 0,
      claimed: 0,
      added: 0,
      stock: localUnused,
      message: ''
    }

    if (!testCode) {
      base.message = '缺少测题代码'
      return base
    }

    const now = Date.now()
    const last = this.lastRunByPool.get(poolKey) || 0
    if (!force && now - last < intervalSec * 1000) {
      base.message = '未到补货间隔'
      return base
    }

    let inv = await this.psy.inventory(testCode)
    const cloudUnclaimed = Number(inv.inventory?.unclaimed_unused ?? 0)
    const need =
      force || localUnused <= threshold || (inv.success && cloudUnclaimed <= threshold)
    if (!need) {
      base.message = '库存充足，跳过'
      return base
    }

    this.lastRunByPool.set(poolKey, now)
    let generated = 0

    // 云端无可领或不够本轮数量时先生成（扣额度）
    if (!inv.success || cloudUnclaimed < count) {
      const deficit = Math.max(1, count - Math.max(0, cloudUnclaimed))
      const gen = await this.psy.generateLinks(testCode, deficit)
      if (!gen.success) {
        base.message = gen.message || '云端生成链接失败'
        this.logger.warn(`[AutoReplenish] generate 失败 test=${testCode}: ${base.message}`)
        this.emit(base)
        return base
      }
      generated = Number(gen.generated || 0)
      this.logger.info(`[AutoReplenish] 已生成 ${generated} 条 test=${testCode}`)
      inv = await this.psy.inventory(testCode)
    }

    const claim = await this.psy.claimIntoPool(bindingId, testCode, count, productId)
    const added = Number(claim.added || 0)
    const claimed = Number(claim.claimed || claim.urls?.length || 0)
    const nextStats = this.storage.getCardPoolStats(bindingId)
    const evt: ReplenishEvent = {
      bindingId,
      productId,
      testCode,
      generated,
      claimed,
      added,
      stock: Number(nextStats?.unused ?? 0),
      message: claim.success
        ? `自动补货：生成 ${generated}，领取 ${claimed}，入池 ${added}，池库存 ${nextStats?.unused ?? 0}`
        : claim.message || '领取入池失败'
    }
    if (claim.success && (generated > 0 || added > 0)) {
      this.logger.info(`[AutoReplenish] ${evt.message}`)
    } else if (!claim.success) {
      this.logger.warn(`[AutoReplenish] ${evt.message}`)
    }
    this.emit(evt)
    return evt
  }
}
