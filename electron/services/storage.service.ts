import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import * as crypto from 'crypto'
import { decrypt as cookieDecrypt } from '../utils/crypto'
import { LoggerService } from './logger.service'

/**
 * 加密本地存储服务
 * - 使用 SQLite 作为底层存储
 * - 敏感字段使用 AES-256-CBC 加密
 * - 对标原版 Agiso.SQLite + SQLCipher
 */
export class StorageService {
  private db!: Database.Database
  private encryptionKey: string
  private logger: LoggerService

  constructor(logger?: LoggerService) {
    this.logger = logger || new LoggerService()
    this.encryptionKey = this.deriveKey()
    this.init()
  }

  /**
   * 从设备特征派生加密密钥（一机一密）
   */
  private deriveKey(): string {
    const machineId = this.getMachineId()
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 32)
  }

  private getMachineId(): string {
    // Windows MachineGuid 作为基础
    try {
      const { execSync } = require('child_process')
      const guid = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8' })
      const match = guid.match(/MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i)
      return match ? match[1] : 'fallback-machine-id'
    } catch {
      return 'fallback-machine-id'
    }
  }

  private init() {
    const userDataPath = app.getPath('userData')
    const dbPath = join(userDataPath, 'data.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')

    this.createTables()
    this.logger.info('[Storage] 数据库初始化完成: ' + dbPath)
  }

  private createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT,
        encrypted INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_code TEXT NOT NULL,
        license_key TEXT NOT NULL,
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shop_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL UNIQUE,
        shop_name TEXT,
        auto_ship_enabled INTEGER DEFAULT 0,
        auto_reply_enabled INTEGER DEFAULT 0,
        config_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ship_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        tracking_number TEXT,
        status TEXT,
        error_msg TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reply_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        reply_text TEXT NOT NULL,
        reply_type TEXT DEFAULT 'text',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sub_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        sub_account_id TEXT,
        username TEXT,
        password TEXT,
        cookies TEXT,
        last_login_at INTEGER,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shop_cookies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        cookie_data TEXT NOT NULL,
        saved_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS product_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT,
        product_type TEXT DEFAULT 'virtual',
        deliver_type TEXT DEFAULT 'card',
        deliver_content TEXT NOT NULL,
        stock INTEGER DEFAULT 0,
        delivered_count INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        random_mode INTEGER DEFAULT 0,
        low_stock_alert INTEGER DEFAULT 10,
        send_interval_ms INTEGER DEFAULT 500,
        uid_length INTEGER DEFAULT 10,
        msg_separator TEXT DEFAULT '\n\n',
        psy_test_code TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS card_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        binding_id INTEGER NOT NULL,
        card_content TEXT NOT NULL,
        status TEXT DEFAULT 'unused',
        order_id TEXT,
        used_at TEXT,
        locked_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (binding_id) REFERENCES product_bindings(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS order_delivery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shop_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT,
        binding_id INTEGER,
        buyer_uid TEXT,
        msg_guid TEXT NOT NULL,
        msg_index INTEGER DEFAULT 1,
        msg_total INTEGER DEFAULT 1,
        send_status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        card_content TEXT,
        error_msg TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ship_log_shop ON ship_log(shop_id);
      CREATE INDEX IF NOT EXISTS idx_reply_rules_shop ON reply_rules(shop_id);
      CREATE INDEX IF NOT EXISTS idx_sub_accounts_shop ON sub_accounts(shop_id);
      CREATE INDEX IF NOT EXISTS idx_shop_cookies_shop ON shop_cookies(shop_id);
      CREATE INDEX IF NOT EXISTS idx_product_bindings_shop ON product_bindings(shop_id);
      CREATE INDEX IF NOT EXISTS idx_product_bindings_pid ON product_bindings(product_id);
      CREATE INDEX IF NOT EXISTS idx_card_pool_binding ON card_pool(binding_id);
      CREATE INDEX IF NOT EXISTS idx_card_pool_status ON card_pool(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_shop_order_msg ON order_delivery(shop_id, order_id, msg_index);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_guid ON order_delivery(msg_guid);

      -- 全量订单台账：轮询到的订单号一律入库；是否发码只看 order_delivery.success
      CREATE TABLE IF NOT EXISTS order_ledger (
        order_id TEXT PRIMARY KEY,
        shop_id TEXT NOT NULL DEFAULT '',
        product_id TEXT DEFAULT '',
        platform_status TEXT DEFAULT '',
        platform_status_code INTEGER,
        order_time TEXT DEFAULT '',
        is_virtual INTEGER DEFAULT 0,
        first_seen_at TEXT DEFAULT (datetime('now')),
        last_seen_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_order_ledger_shop ON order_ledger(shop_id);
      CREATE INDEX IF NOT EXISTS idx_order_ledger_product ON order_ledger(product_id);
    `)

    // 增量列（幂等）：旧库可能缺 random_mode 等，导致保存绑定静默失败
    const bindingAlters = [
      `ALTER TABLE product_bindings ADD COLUMN product_type TEXT DEFAULT 'virtual'`,
      `ALTER TABLE product_bindings ADD COLUMN deliver_type TEXT DEFAULT 'card'`,
      `ALTER TABLE product_bindings ADD COLUMN stock INTEGER DEFAULT 0`,
      `ALTER TABLE product_bindings ADD COLUMN delivered_count INTEGER DEFAULT 0`,
      `ALTER TABLE product_bindings ADD COLUMN enabled INTEGER DEFAULT 1`,
      `ALTER TABLE product_bindings ADD COLUMN random_mode INTEGER DEFAULT 0`,
      `ALTER TABLE product_bindings ADD COLUMN low_stock_alert INTEGER DEFAULT 10`,
      `ALTER TABLE product_bindings ADD COLUMN send_interval_ms INTEGER DEFAULT 500`,
      `ALTER TABLE product_bindings ADD COLUMN uid_length INTEGER DEFAULT 10`,
      `ALTER TABLE product_bindings ADD COLUMN msg_separator TEXT DEFAULT '\n\n'`,
      `ALTER TABLE product_bindings ADD COLUMN psy_test_code TEXT DEFAULT ''`,
      `ALTER TABLE product_bindings ADD COLUMN pool_key TEXT DEFAULT ''`,
      `ALTER TABLE product_bindings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
      `ALTER TABLE product_bindings ADD COLUMN auto_replenish_enabled INTEGER DEFAULT 0`,
      `ALTER TABLE product_bindings ADD COLUMN auto_replenish_threshold INTEGER DEFAULT 10`,
      `ALTER TABLE product_bindings ADD COLUMN auto_replenish_count INTEGER DEFAULT 20`,
      `ALTER TABLE product_bindings ADD COLUMN auto_replenish_interval_sec INTEGER DEFAULT 300`,
      `ALTER TABLE card_pool ADD COLUMN locked_at TEXT`,
      `ALTER TABLE card_pool ADD COLUMN order_id TEXT`,
      `ALTER TABLE card_pool ADD COLUMN used_at TEXT`,
      `ALTER TABLE card_pool ADD COLUMN pool_key TEXT DEFAULT ''`,
    ]
    try {
      this.db.exec('DROP INDEX IF EXISTS idx_order_delivery_order')
    } catch {
      /* 旧库全局 order_id 唯一索引：跨店会误伤，改为 (shop_id, order_id) */
    }
    try {
      this.db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_shop_order ON order_delivery(shop_id, order_id)'
      )
    } catch {
      /* ignore */
    }
    // Phase1：多轮消息按 msg_index 落库（替换「一单一行」唯一约束）
    this.migrateOrderDeliveryMsgIndexUnique()
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS order_ledger (
          order_id TEXT PRIMARY KEY,
          shop_id TEXT NOT NULL DEFAULT '',
          product_id TEXT DEFAULT '',
          platform_status TEXT DEFAULT '',
          platform_status_code INTEGER,
          order_time TEXT DEFAULT '',
          is_virtual INTEGER DEFAULT 0,
          first_seen_at TEXT DEFAULT (datetime('now')),
          last_seen_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_order_ledger_shop ON order_ledger(shop_id);
        CREATE INDEX IF NOT EXISTS idx_order_ledger_product ON order_ledger(product_id);
      `)
    } catch {
      /* ignore */
    }
    if (!this.getShopConfig('default')) {
      this.saveShopConfig('default', {
        shopName: '默认店铺',
        autoShipEnabled: true,
        autoReplyEnabled: false
      })
    }

    for (const sql of bindingAlters) {
      try {
        this.db.exec(sql)
      } catch {
        /* column already exists */
      }
    }

    this.migrateMerchantLevelBindings()
  }

  /**
   * 将 order_delivery 唯一约束从 (shop_id, order_id) 升级为 (shop_id, order_id, msg_index)，
   * 并为历史「msg_total>1 但只有 1 行 success」回填占位，避免误重发后几轮。
   */
  private migrateOrderDeliveryMsgIndexUnique(): void {
    const flag = 'migrate_order_delivery_msg_index_v1'
    if (this.get<boolean>(flag)) return
    try {
      const tx = this.db.transaction(() => {
        this.db.exec('DROP INDEX IF EXISTS idx_order_delivery_shop_order')
        this.db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_shop_order_msg
           ON order_delivery(shop_id, order_id, msg_index)`
        )
        const legacy = this.db
          .prepare(
            `SELECT shop_id, order_id, product_id, binding_id, buyer_uid, card_content, msg_total, send_status
             FROM order_delivery
             WHERE send_status = 'success' AND IFNULL(msg_total, 1) > 1`
          )
          .all() as Array<{
          shop_id: string
          order_id: string
          product_id: string
          binding_id: number | null
          buyer_uid: string
          card_content: string
          msg_total: number
          send_status: string
        }>
        const ins = this.db.prepare(
          `INSERT OR IGNORE INTO order_delivery
            (shop_id, order_id, product_id, binding_id, buyer_uid, msg_guid, msg_index, msg_total, send_status, card_content, error_msg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?, 'legacy_backfill')`
        )
        for (const row of legacy) {
          const total = Math.max(1, Number(row.msg_total) || 1)
          for (let i = 2; i <= total; i++) {
            ins.run(
              row.shop_id,
              row.order_id,
              row.product_id || '',
              row.binding_id,
              row.buyer_uid || '',
              `legacy-${row.order_id}-${i}`,
              i,
              total,
              row.card_content || ''
            )
          }
        }
      })
      tx()
      this.set(flag, true)
    } catch (e) {
      try {
        this.db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_shop_order_msg
           ON order_delivery(shop_id, order_id, msg_index)`
        )
      } catch {
        /* ignore */
      }
      console.warn('[Storage] migrateOrderDeliveryMsgIndexUnique:', e)
    }
  }

  /**
   * 商家级绑定：同一 product_id 只留一条；多商品可共享 pool_key；卡密按 pool_key 消耗一次。
   */
  private migrateMerchantLevelBindings(): void {
    const flag = 'migrate_merchant_bindings_v2'
    if (this.get<boolean>(flag)) return
    try {
      const tx = this.db.transaction(() => {
        const rows = this.db
          .prepare('SELECT id, shop_id, product_id, deliver_type, psy_test_code, pool_key, enabled, updated_at FROM product_bindings')
          .all() as Array<{
          id: number
          shop_id: string
          product_id: string
          deliver_type: string
          psy_test_code: string
          pool_key: string
          enabled: number
          updated_at: string
        }>

        // 1) 为每行补全 pool_key
        for (const r of rows) {
          const key = this.computePoolKey(r)
          if (String(r.pool_key || '').trim() !== key) {
            this.db.prepare('UPDATE product_bindings SET pool_key = ? WHERE id = ?').run(key, r.id)
            r.pool_key = key
          }
        }

        // 2) 同一 product_id 多店重复：保留最新 enabled 优先
        const byPid = new Map<string, typeof rows>()
        for (const r of rows) {
          const pid = String(r.product_id || '').trim()
          if (!pid) continue
          const list = byPid.get(pid) || []
          list.push(r)
          byPid.set(pid, list)
        }
        for (const [, list] of byPid) {
          if (list.length <= 1) continue
          list.sort((a, b) => {
            if (!!b.enabled !== !!a.enabled) return (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0)
            return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || b.id - a.id
          })
          const keep = list[0]
          for (const doomed of list.slice(1)) {
            this.db
              .prepare('UPDATE card_pool SET binding_id = ?, pool_key = ? WHERE binding_id = ?')
              .run(keep.id, keep.pool_key || this.computePoolKey(keep), doomed.id)
            this.db.prepare('DELETE FROM product_bindings WHERE id = ?').run(doomed.id)
            this.logger.info(
              `[Storage] 商家级去重: product_id=${keep.product_id} 保留#${keep.id} 删除#${doomed.id}(原shop=${doomed.shop_id})`
            )
          }
        }

        // 3) 回填 card_pool.pool_key
        this.db.exec(`
          UPDATE card_pool
             SET pool_key = COALESCE(
               (SELECT NULLIF(trim(pb.pool_key),'') FROM product_bindings pb WHERE pb.id = card_pool.binding_id),
               'binding:' || card_pool.binding_id
             )
           WHERE pool_key IS NULL OR trim(pool_key) = ''
        `)

        // 4) 换唯一索引：product_id 商家唯一（不再按店）
        try {
          this.db.exec('DROP INDEX IF EXISTS idx_product_bindings_shop_pid')
        } catch {
          /* ignore */
        }
        try {
          this.db.exec(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bindings_pid_unique ON product_bindings(product_id)'
          )
        } catch (e) {
          this.logger.warn(`[Storage] 创建 product_id 唯一索引失败（可能仍有重复）: ${e}`)
        }
        try {
          this.db.exec('CREATE INDEX IF NOT EXISTS idx_card_pool_pool_key ON card_pool(pool_key)')
        } catch {
          /* ignore */
        }

        // 5) 刷新各共享池库存
        const keys = this.db
          .prepare(`SELECT DISTINCT pool_key FROM product_bindings WHERE pool_key IS NOT NULL AND trim(pool_key) != ''`)
          .all() as Array<{ pool_key: string }>
        for (const k of keys) this.refreshPoolStock(k.pool_key)
      })
      tx()
      this.set(flag, true)
      this.logger.info('[Storage] 商家级绑定迁移完成')
    } catch (e) {
      this.logger.warn(`[Storage] 商家级绑定迁移失败: ${e}`)
    }
  }

  /** 共享发卡池键：link_card 用测题；普通卡密用显式 pool_key 或 binding:id */
  computePoolKey(binding: {
    id?: number
    deliver_type?: string
    psy_test_code?: string
    pool_key?: string
  }): string {
    const explicit = String(binding.pool_key || '').trim()
    if (explicit) return explicit
    const dtype = String(binding.deliver_type || '')
    if (dtype === 'link_card') {
      const code = String(binding.psy_test_code || '').trim()
      if (code) return `psy:${code}`
    }
    if (binding.id) return `binding:${binding.id}`
    return ''
  }

  refreshPoolStock(poolKey: string): void {
    const key = String(poolKey || '').trim()
    if (!key) return
    const unused = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ? AND status = 'unused'`)
        .get(key) as { c: number }
    ).c
    this.db
      .prepare(
        `UPDATE product_bindings SET stock = ?, updated_at = datetime('now') WHERE pool_key = ?`
      )
      .run(unused, key)
  }

  listSharedPools(): Array<{
    pool_key: string
    label: string
    deliver_type: string
    psy_test_code: string
    unused: number
    product_count: number
  }> {
    const rows = this.db
      .prepare(
        `SELECT pool_key,
                MAX(deliver_type) as deliver_type,
                MAX(psy_test_code) as psy_test_code,
                COUNT(*) as product_count
         FROM product_bindings
         WHERE pool_key IS NOT NULL AND trim(pool_key) != ''
         GROUP BY pool_key
         ORDER BY product_count DESC, pool_key ASC`
      )
      .all() as Array<{
      pool_key: string
      deliver_type: string
      psy_test_code: string
      product_count: number
    }>
    return rows.map((r) => {
      const unused = (
        this.db
          .prepare(`SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ? AND status = 'unused'`)
          .get(r.pool_key) as { c: number }
      ).c
      const sample = this.db
        .prepare(
          `SELECT product_name, product_id FROM product_bindings WHERE pool_key = ? ORDER BY id ASC LIMIT 1`
        )
        .get(r.pool_key) as { product_name?: string; product_id?: string } | undefined
      const code = String(r.psy_test_code || '').trim()
      const label =
        r.deliver_type === 'link_card' && code
          ? `心象测 ${code}`
          : `卡池 ${r.pool_key.replace(/^binding:/, '#')}（${sample?.product_name || sample?.product_id || r.pool_key}）`
      return {
        pool_key: r.pool_key,
        label,
        deliver_type: r.deliver_type,
        psy_test_code: code,
        unused,
        product_count: Number(r.product_count || 0)
      }
    })
  }

  /**
   * 设置键值对（自动加密敏感数据）
   */
  set(key: string, value: unknown, encrypt: boolean = false): void {
    const jsonValue = JSON.stringify(value)
    const isSensitive = encrypt || this.isSensitiveKey(key)
    const storedValue = isSensitive ? this.encrypt(jsonValue) : jsonValue

    this.db.prepare(
      `INSERT INTO kv_store (key, value, encrypted, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         encrypted = excluded.encrypted,
         updated_at = datetime('now')`
    ).run(key, storedValue, isSensitive ? 1 : 0)
  }

  /**
   * 获取键值对
   */
  get<T = unknown>(key: string): T | null {
    const row = this.db.prepare(
      'SELECT value, encrypted FROM kv_store WHERE key = ?'
    ).get(key) as { value: string; encrypted: number } | undefined

    if (!row) return null

    const jsonValue = row.encrypted === 1 ? this.decrypt(row.value) : row.value
    try {
      return JSON.parse(jsonValue) as T
    } catch {
      return jsonValue as T
    }
  }

  /**
   * 获取所有配置
   */
  getAll(): Record<string, unknown> {
    const rows = this.db.prepare(
      'SELECT key, value, encrypted FROM kv_store'
    ).all() as { key: string; value: string; encrypted: number }[]

    const result: Record<string, unknown> = {}
    for (const row of rows) {
      const jsonValue = row.encrypted === 1 ? this.decrypt(row.value) : row.value
      try {
        result[row.key] = JSON.parse(jsonValue)
      } catch {
        result[row.key] = jsonValue
      }
    }
    return result
  }

  /**
   * 删除键值对
   */
  delete(key: string): void {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
  }

  // ==================== 敏感数据加密 ====================
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = ['license', 'token', 'cookie', 'password', 'secret', 'apiKey']
    return sensitiveKeys.some((k) => key.toLowerCase().includes(k))
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return iv.toString('hex') + ':' + encrypted.toString('hex')
  }

  private decrypt(text: string): string {
    const [ivHex, dataHex] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(dataHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv)
    return decipher.update(encrypted) + decipher.final('utf8')
  }

  // ==================== 业务数据访问 ====================
  saveShopConfig(shopId: string, config: any) {
    this.db.prepare(
      `INSERT INTO shop_config (shop_id, shop_name, auto_ship_enabled, auto_reply_enabled, config_json, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(shop_id) DO UPDATE SET
         shop_name = excluded.shop_name,
         auto_ship_enabled = excluded.auto_ship_enabled,
         auto_reply_enabled = excluded.auto_reply_enabled,
         config_json = excluded.config_json,
         updated_at = datetime('now')`
    ).run(
      shopId,
      config.shopName || '',
      config.autoShipEnabled ? 1 : 0,
      config.autoReplyEnabled ? 1 : 0,
      JSON.stringify(config)
    )
  }

  getShopConfig(shopId: string) {
    const row = this.db.prepare('SELECT * FROM shop_config WHERE shop_id = ?').get(shopId) as any
    if (!row) return null
    return {
      ...row,
      autoShipEnabled: !!row.auto_ship_enabled,
      autoReplyEnabled: !!row.auto_reply_enabled,
      config: row.config_json ? JSON.parse(row.config_json) : {}
    }
  }

  getAllShopConfigs() {
    const rows = this.db.prepare('SELECT * FROM shop_config').all() as any[]
    return rows.map((row) => ({
      ...row,
      autoShipEnabled: !!row.auto_ship_enabled,
      autoReplyEnabled: !!row.auto_reply_enabled,
      config: row.config_json ? JSON.parse(row.config_json) : {}
    }))
  }

  addShipLog(log: { shopId: string; orderId: string; trackingNumber?: string; status: string; errorMsg?: string }) {
    this.db.prepare(
      `INSERT INTO ship_log (shop_id, order_id, tracking_number, status, error_msg)
       VALUES (?, ?, ?, ?, ?)`
    ).run(log.shopId, log.orderId, log.trackingNumber || '', log.status, log.errorMsg || '')
  }

  getShipLogs(shopId: string, limit: number = 100) {
    // 商家统一面板：传空/'*' 或具体店都返回全量，按时间倒序
    if (!shopId || shopId === '*' || shopId === '__all__') {
      return this.db
        .prepare('SELECT * FROM ship_log ORDER BY created_at DESC LIMIT ?')
        .all(limit)
    }
    return this.db
      .prepare('SELECT * FROM ship_log ORDER BY created_at DESC LIMIT ?')
      .all(limit)
  }

  addReplyRule(rule: { shopId: string; keyword: string; replyText: string; replyType?: string }) {
    this.db.prepare(
      `INSERT INTO reply_rules (shop_id, keyword, reply_text, reply_type)
       VALUES (?, ?, ?, ?)`
    ).run(rule.shopId, rule.keyword, rule.replyText, rule.replyType || 'text')
  }

  getReplyRules(shopId: string, includeDisabled = false) {
    if (includeDisabled) {
      return this.db.prepare(
        'SELECT * FROM reply_rules WHERE shop_id = ? ORDER BY id DESC'
      ).all(shopId)
    }
    return this.db.prepare(
      'SELECT * FROM reply_rules WHERE shop_id = ? AND enabled = 1'
    ).all(shopId)
  }

  updateReplyRule(id: number, updates: { keyword?: string; replyText?: string; replyType?: string; enabled?: boolean }) {
    const fields: string[] = []
    const values: unknown[] = []
    if (updates.keyword !== undefined) { fields.push('keyword = ?'); values.push(updates.keyword) }
    if (updates.replyText !== undefined) { fields.push('reply_text = ?'); values.push(updates.replyText) }
    if (updates.replyType !== undefined) { fields.push('reply_type = ?'); values.push(updates.replyType) }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0) }
    if (fields.length === 0) return false
    values.push(id)
    const result = this.db.prepare(`UPDATE reply_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return result.changes > 0
  }

  deleteReplyRule(id: number): boolean {
    const result = this.db.prepare('DELETE FROM reply_rules WHERE id = ?').run(id)
    return result.changes > 0
  }

  saveReshipConfig(shopId: string, config: { enabled: boolean; retryIntervalMs?: number }) {
    this.set(`reship_config_${shopId}`, config)
  }

  getReshipConfig(shopId: string): { enabled: boolean; retryIntervalMs: number } | null {
    return this.get(`reship_config_${shopId}`)
  }

  /**
   * 解密 Cookie 并格式化为 HTTP Cookie 头
   */
  getShopCookieHeader(shopId: string): string | null {
    const encrypted = this.getShopCookies(shopId)
    if (!encrypted) return null
    try {
      const cookieJson = cookieDecrypt(encrypted)
      const cookies = JSON.parse(cookieJson) as Array<{ name: string; value: string }>
      return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    } catch {
      return null
    }
  }

  // ==================== Cookie 存储（对标原版 Cookie 管理）====================
  saveShopCookies(shopId: string, cookieData: string) {
    // 先删除旧的
    this.db.prepare('DELETE FROM shop_cookies WHERE shop_id = ?').run(shopId)
    // 插入新的
    this.db.prepare(
      `INSERT INTO shop_cookies (shop_id, cookie_data) VALUES (?, ?)`
    ).run(shopId, cookieData)
  }

  getShopCookies(shopId: string): string | null {
    const row = this.db.prepare(
      'SELECT cookie_data FROM shop_cookies WHERE shop_id = ? ORDER BY saved_at DESC LIMIT 1'
    ).get(shopId) as any
    return row ? row.cookie_data : null
  }

  deleteShopCookies(shopId: string): void {
    this.db.prepare('DELETE FROM shop_cookies WHERE shop_id = ?').run(shopId)
  }

  getActiveShopId(): string {
    return String(this.get<string>('currentShopId') || 'default')
  }

  setActiveShopId(shopId: string): void {
    this.set('currentShopId', shopId || 'default')
  }

  listShops(): Array<{ id: string; name: string; sellerId?: string }> {
    const rows = this.getAllShopConfigs()
    return rows.map((r: any) => ({
      id: String(r.shop_id || ''),
      name: String(r.shop_name || r.config?.shopName || r.shop_id || '未命名店铺'),
      sellerId: String(r.config?.xhsSellerId || r.config?.sellerId || '')
    })).filter((s) => s.id)
  }

  deleteShop(shopId: string): boolean {
    if (!shopId || shopId === 'default') return false
    this.db.prepare('DELETE FROM shop_cookies WHERE shop_id = ?').run(shopId)
    this.db.prepare('DELETE FROM shop_config WHERE shop_id = ?').run(shopId)
    return true
  }

  // ==================== 子账号管理（对标原版 SubAccount）====================
  addSubAccount(account: {
    shopId: string
    subAccountId?: string
    username: string
    password: string
  }) {
    this.db.prepare(
      `INSERT INTO sub_accounts (shop_id, sub_account_id, username, password, last_login_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      account.shopId,
      account.subAccountId || '',
      account.username,
      this.encrypt(account.password),
      Date.now()
    )
  }

  getSubAccounts(shopId: string) {
    const rows = this.db.prepare(
      'SELECT id, shop_id, sub_account_id, username, last_login_at, status FROM sub_accounts WHERE shop_id = ?'
    ).all(shopId) as any[]
    return rows
  }

  updateSubAccountLogin(id: number) {
    this.db.prepare(
      'UPDATE sub_accounts SET last_login_at = ? WHERE id = ?'
    ).run(Date.now(), id)
  }

  getSubAccountCredentials(id: number): { id: number; shopId: string; username: string; password: string } | null {
    const row = this.db.prepare(
      'SELECT id, shop_id, username, password FROM sub_accounts WHERE id = ?'
    ).get(id) as any
    if (!row) return null
    return {
      id: row.id,
      shopId: row.shop_id,
      username: row.username,
      password: this.decrypt(row.password)
    }
  }

  saveMainLoginInfo(shopId: string, email: string, password: string) {
    this.setShopConfigValue(shopId, 'main_login_email', email)
    // 空密码表示仅更新邮箱，保留原密码
    if (password) {
      this.setShopConfigValue(shopId, 'main_login_password', this.encrypt(password))
    }
  }

  getMainLoginInfo(shopId: string): { email: string; password: string } | null {
    const email = this.getShopConfigValue(shopId, 'main_login_email')
    if (!email) return null
    const encPwd = this.getShopConfigValue(shopId, 'main_login_password')
    return {
      email,
      password: encPwd ? this.decrypt(encPwd) : ''
    }
  }

  // ==================== 店铺配置（key-value 方式）====================
  setShopConfigValue(shopId: string, key: string, value: string) {
    const row = this.db.prepare('SELECT config_json FROM shop_config WHERE shop_id = ?').get(shopId) as any
    let config: any = row?.config_json ? JSON.parse(row.config_json) : {}
    config[key] = value

    this.db.prepare(
      `INSERT INTO shop_config (shop_id, config_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(shop_id) DO UPDATE SET
         config_json = excluded.config_json,
         updated_at = datetime('now')`
    ).run(shopId, JSON.stringify(config))
  }

  getShopConfigValue(shopId: string, key: string): string | null {
    const row = this.db.prepare('SELECT config_json FROM shop_config WHERE shop_id = ?').get(shopId) as any
    if (!row?.config_json) return null
    try {
      const config = JSON.parse(row.config_json)
      return config[key] ?? null
    } catch {
      return null
    }
  }

  // ==================== 商品绑定（对标原版商品ID绑卡密）====================
  /**
   * 添加商品绑定
   * @param binding 商品绑定信息
   */
  addProductBinding(binding: {
    shopId?: string
    productId: string
    productName?: string
    productType?: 'virtual' | 'physical'
    deliverType?: 'card' | 'link_card' | 'text' | 'link' | 'note' | 'image' | 'video' | 'mixed' | 'manual'
    deliverContent: string
    stock?: number
    randomMode?: boolean
    lowStockAlert?: number
    sendIntervalMs?: number
    uidLength?: number
    msgSeparator?: string
    psyTestCode?: string
    poolKey?: string
    autoReplenishEnabled?: boolean
    autoReplenishThreshold?: number
    autoReplenishCount?: number
    autoReplenishIntervalSec?: number
  }): number {
    const deliverType = binding.deliverType || 'card'
    const psyTestCode = binding.psyTestCode || ''
    let poolKey = String(binding.poolKey || '').trim()
    if (!poolKey) {
      if (deliverType === 'link_card' && psyTestCode.trim()) poolKey = `psy:${psyTestCode.trim()}`
    }

    const existing = this.db
      .prepare('SELECT id FROM product_bindings WHERE product_id = ?')
      .get(String(binding.productId).trim()) as { id: number } | undefined
    if (existing?.id) {
      this.updateProductBinding(existing.id, {
        productName: binding.productName,
        productType: binding.productType,
        deliverType,
        deliverContent: binding.deliverContent,
        randomMode: binding.randomMode,
        lowStockAlert: binding.lowStockAlert,
        sendIntervalMs: binding.sendIntervalMs,
        uidLength: binding.uidLength,
        msgSeparator: binding.msgSeparator,
        psyTestCode,
        poolKey: poolKey || undefined,
        shopId: binding.shopId,
        autoReplenishEnabled: binding.autoReplenishEnabled,
        autoReplenishThreshold: binding.autoReplenishThreshold,
        autoReplenishCount: binding.autoReplenishCount,
        autoReplenishIntervalSec: binding.autoReplenishIntervalSec
      })
      return existing.id
    }

    const result = this.db.prepare(
      `INSERT INTO product_bindings
        (shop_id, product_id, product_name, product_type, deliver_type, deliver_content, stock,
         random_mode, low_stock_alert, send_interval_ms, uid_length, msg_separator, psy_test_code, pool_key,
         auto_replenish_enabled, auto_replenish_threshold, auto_replenish_count, auto_replenish_interval_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      binding.shopId || '',
      String(binding.productId).trim(),
      binding.productName || '',
      binding.productType || 'virtual',
      deliverType,
      binding.deliverContent,
      binding.stock || 0,
      binding.randomMode ? 1 : 0,
      binding.lowStockAlert ?? 10,
      binding.sendIntervalMs ?? 500,
      binding.uidLength ?? 10,
      binding.msgSeparator ?? '\n\n',
      psyTestCode,
      poolKey,
      binding.autoReplenishEnabled ? 1 : 0,
      binding.autoReplenishThreshold ?? binding.lowStockAlert ?? 10,
      binding.autoReplenishCount ?? 20,
      binding.autoReplenishIntervalSec ?? 300
    )
    const id = Number(result.lastInsertRowid)
    if (!poolKey) {
      poolKey = `binding:${id}`
      this.db.prepare('UPDATE product_bindings SET pool_key = ? WHERE id = ?').run(poolKey, id)
    }
    this.refreshPoolStock(poolKey)
    this.logger.info(`[Storage] 新增商品绑定: productId=${binding.productId}, pool=${poolKey}, id=${id}`)
    return id
  }

  /**
   * 批量添加卡密到共享发卡池（按 binding → pool_key；多商品共用同一池）
   */
  addCardPool(bindingId: number, cards: string[], options?: { skipDuplicate?: boolean }): number {
    if (cards.length === 0) return 0
    const skipDuplicate = options?.skipDuplicate ?? true
    const binding = this.db
      .prepare('SELECT id, pool_key, deliver_type, psy_test_code FROM product_bindings WHERE id = ?')
      .get(bindingId) as { id: number; pool_key: string; deliver_type: string; psy_test_code: string } | undefined
    if (!binding) return 0
    const poolKey = this.computePoolKey(binding)
    if (String(binding.pool_key || '').trim() !== poolKey) {
      this.db.prepare('UPDATE product_bindings SET pool_key = ? WHERE id = ?').run(poolKey, bindingId)
    }

    const existing = this.db
      .prepare('SELECT card_content FROM card_pool WHERE pool_key = ?')
      .all(poolKey) as { card_content: string }[]
    const existingSet = new Set(existing.map((r) => r.card_content))

    const toInsert = skipDuplicate
      ? cards.filter((c) => c && !existingSet.has(c))
      : cards.filter((c) => !!c)

    if (toInsert.length === 0) {
      this.logger.info(`[Storage] 卡密全部重复，跳过: pool=${poolKey}`)
      return 0
    }

    const stmt = this.db.prepare(
      'INSERT INTO card_pool (binding_id, pool_key, card_content) VALUES (?, ?, ?)'
    )
    const tx = this.db.transaction((items: string[]) => {
      for (const c of items) stmt.run(bindingId, poolKey, c)
    })
    tx(toInsert)
    this.refreshPoolStock(poolKey)
    this.logger.info(
      `[Storage] 批量添加卡密: pool=${poolKey}, count=${toInsert.length}, 去重跳过=${cards.length - toInsert.length}`
    )
    return toInsert.length
  }

  /**
   * 商家级匹配：只认 product_id（shopId 兼容保留，不参与匹配）
   */
  getProductBinding(shopIdOrProductId: string, productId?: string): any | null {
    const id =
      productId !== undefined && productId !== null
        ? String(productId || '').trim()
        : String(shopIdOrProductId || '').trim()
    if (!id) return null
    const row = this.db
      .prepare('SELECT * FROM product_bindings WHERE product_id = ? AND enabled = 1 LIMIT 1')
      .get(id) as any
    if (!row) return null
    return {
      ...row,
      enabled: !!row.enabled,
      product_type: row.product_type,
      deliver_type: row.deliver_type,
      pool_key: row.pool_key || this.computePoolKey(row)
    }
  }

  /**
   * 全部商品绑定（商家统一面板，不随切换店铺清空）
   */
  getAllProductBindings(_shopId?: string): any[] {
    const rows = this.db.prepare('SELECT * FROM product_bindings ORDER BY updated_at DESC').all() as any[]
    return rows.map((r) => ({
      ...r,
      enabled: !!r.enabled,
      pool_key: r.pool_key || this.computePoolKey(r)
    }))
  }

  /**
   * 更新商品绑定
   */
  updateProductBinding(id: number, updates: {
    productName?: string
    productType?: string
    deliverType?: string
    deliverContent?: string
    enabled?: boolean
    randomMode?: boolean
    lowStockAlert?: number
    sendIntervalMs?: number
    uidLength?: number
    msgSeparator?: string
    psyTestCode?: string
    poolKey?: string
    shopId?: string
    autoReplenishEnabled?: boolean
    autoReplenishThreshold?: number
    autoReplenishCount?: number
    autoReplenishIntervalSec?: number
  }): boolean {
    const fields: string[] = []
    const values: any[] = []
    if (updates.productName !== undefined) { fields.push('product_name = ?'); values.push(updates.productName) }
    if (updates.productType !== undefined) { fields.push('product_type = ?'); values.push(updates.productType) }
    if (updates.deliverType !== undefined) { fields.push('deliver_type = ?'); values.push(updates.deliverType) }
    if (updates.deliverContent !== undefined) { fields.push('deliver_content = ?'); values.push(updates.deliverContent) }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0) }
    if (updates.randomMode !== undefined) { fields.push('random_mode = ?'); values.push(updates.randomMode ? 1 : 0) }
    if (updates.lowStockAlert !== undefined) { fields.push('low_stock_alert = ?'); values.push(updates.lowStockAlert) }
    if (updates.sendIntervalMs !== undefined) { fields.push('send_interval_ms = ?'); values.push(updates.sendIntervalMs) }
    if (updates.uidLength !== undefined) { fields.push('uid_length = ?'); values.push(updates.uidLength) }
    if (updates.msgSeparator !== undefined) { fields.push('msg_separator = ?'); values.push(updates.msgSeparator) }
    if (updates.psyTestCode !== undefined) { fields.push('psy_test_code = ?'); values.push(updates.psyTestCode) }
    if (updates.shopId !== undefined) { fields.push('shop_id = ?'); values.push(updates.shopId) }
    if (updates.autoReplenishEnabled !== undefined) {
      fields.push('auto_replenish_enabled = ?')
      values.push(updates.autoReplenishEnabled ? 1 : 0)
    }
    if (updates.autoReplenishThreshold !== undefined) {
      fields.push('auto_replenish_threshold = ?')
      values.push(updates.autoReplenishThreshold)
    }
    if (updates.autoReplenishCount !== undefined) {
      fields.push('auto_replenish_count = ?')
      values.push(updates.autoReplenishCount)
    }
    if (updates.autoReplenishIntervalSec !== undefined) {
      fields.push('auto_replenish_interval_sec = ?')
      values.push(updates.autoReplenishIntervalSec)
    }

    const cur = this.db.prepare('SELECT * FROM product_bindings WHERE id = ?').get(id) as any
    if (!cur) return false

    let nextPool = updates.poolKey !== undefined ? String(updates.poolKey || '').trim() : String(cur.pool_key || '').trim()
    const nextType = updates.deliverType !== undefined ? updates.deliverType : cur.deliver_type
    const nextCode = updates.psyTestCode !== undefined ? updates.psyTestCode : cur.psy_test_code
    if (!nextPool) {
      nextPool = this.computePoolKey({
        id,
        deliver_type: nextType,
        psy_test_code: nextCode,
        pool_key: ''
      })
    }
    if (nextType === 'link_card' && String(nextCode || '').trim()) {
      nextPool = `psy:${String(nextCode).trim()}`
    }
    fields.push('pool_key = ?')
    values.push(nextPool)

    if (fields.length === 0) return false
    fields.push('updated_at = datetime(\'now\')')
    values.push(id)
    const result = this.db.prepare(
      `UPDATE product_bindings SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)
    this.db.prepare('UPDATE card_pool SET pool_key = ? WHERE binding_id = ?').run(nextPool, id)
    this.refreshPoolStock(nextPool)
    if (cur.pool_key && cur.pool_key !== nextPool) this.refreshPoolStock(cur.pool_key)
    return result.changes > 0
  }

  /**
   * 删除商品绑定。共享卡池若仍有其他商品引用则保留卡密，仅删本商品行。
   */
  deleteProductBinding(id: number): boolean {
    const row = this.db.prepare('SELECT pool_key FROM product_bindings WHERE id = ?').get(id) as
      | { pool_key: string }
      | undefined
    if (!row) return false
    const poolKey = String(row.pool_key || '').trim()
    const others = poolKey
      ? (
          this.db
            .prepare('SELECT COUNT(*) as c FROM product_bindings WHERE pool_key = ? AND id != ?')
            .get(poolKey, id) as { c: number }
        ).c
      : 0
    const result = this.db.prepare('DELETE FROM product_bindings WHERE id = ?').run(id)
    if (others === 0) {
      this.db.prepare('DELETE FROM card_pool WHERE binding_id = ? OR pool_key = ?').run(id, poolKey || `binding:${id}`)
    } else {
      // 把孤儿卡密挂到同池另一绑定上
      const other = this.db
        .prepare('SELECT id FROM product_bindings WHERE pool_key = ? LIMIT 1')
        .get(poolKey) as { id: number } | undefined
      if (other?.id) {
        this.db.prepare('UPDATE card_pool SET binding_id = ? WHERE binding_id = ?').run(other.id, id)
      }
      this.refreshPoolStock(poolKey)
    }
    return result.changes > 0
  }

  /**
   * 从共享池锁定一张卡密（按 pool_key；同池多商品共用，一码只用一次）
   */
  lockCard(bindingId: number, orderId: string, random: boolean = false): string | null {
    const lockTx = this.db.transaction(() => {
      const binding = this.db
        .prepare('SELECT id, pool_key, deliver_type, psy_test_code FROM product_bindings WHERE id = ?')
        .get(bindingId) as any
      if (!binding) return null
      const poolKey = this.computePoolKey(binding)
      // 同单已锁/已用则直接返回，防重复消耗
      const existing = this.db
        .prepare(
          `SELECT card_content, status FROM card_pool
           WHERE order_id = ? AND (pool_key = ? OR binding_id = ?)
           LIMIT 1`
        )
        .get(orderId, poolKey, bindingId) as { card_content: string; status: string } | undefined
      if (existing?.card_content) return existing.card_content

      const orderBy = random ? 'ORDER BY RANDOM()' : 'ORDER BY id ASC'
      let card = this.db
        .prepare(
          `SELECT id, card_content FROM card_pool WHERE pool_key = ? AND status = 'unused' ${orderBy} LIMIT 1`
        )
        .get(poolKey) as any
      if (!card) {
        card = this.db
          .prepare(
            `SELECT id, card_content FROM card_pool WHERE binding_id = ? AND status = 'unused' ${orderBy} LIMIT 1`
          )
          .get(bindingId) as any
      }
      if (!card) return null
      this.db
        .prepare(
          `UPDATE card_pool SET status = 'locked', order_id = ?, locked_at = datetime('now'), pool_key = ?
           WHERE id = ? AND status = 'unused'`
        )
        .run(orderId, poolKey, card.id)
      const changed = (
        this.db.prepare(`SELECT id FROM card_pool WHERE id = ? AND status = 'locked' AND order_id = ?`).get(
          card.id,
          orderId
        ) as { id: number } | undefined
      )
      if (!changed) return null
      return card.card_content as string
    })
    return lockTx()
  }

  /**
   * 确认卡密已使用（发送成功后：标记 used，库存按共享池刷新）
   */
  confirmCard(orderId: string): void {
    const row = this.db
      .prepare(`SELECT id, pool_key, binding_id FROM card_pool WHERE order_id = ? AND status = 'locked'`)
      .get(orderId) as { id: number; pool_key: string; binding_id: number } | undefined
    this.db
      .prepare(
        `UPDATE card_pool SET status = 'used', used_at = datetime('now'), locked_at = NULL
         WHERE order_id = ? AND status = 'locked'`
      )
      .run(orderId)
    const poolKey =
      row?.pool_key ||
      (row?.binding_id ? this.computePoolKey(this.db.prepare('SELECT * FROM product_bindings WHERE id = ?').get(row.binding_id) as any) : '')
    if (poolKey) this.refreshPoolStock(poolKey)
    if (row?.binding_id) {
      this.db
        .prepare(
          `UPDATE product_bindings SET delivered_count = delivered_count + 1, updated_at = datetime('now') WHERE id = ?`
        )
        .run(row.binding_id)
    }
  }

  /**
   * 回滚卡密（两段式第三步：发送失败后回收为 unused）
   */
  rollbackCard(orderId: string): void {
    this.db.prepare(
      'UPDATE card_pool SET status = \'unused\', order_id = NULL, locked_at = NULL WHERE order_id = ? AND status = \'locked\''
    ).run(orderId)
  }

  /**
   * 消耗一张卡密（事务，兼容旧调用：直接 unused→used）
   * @deprecated 请使用 lockCard/confirmCard/rollbackCard 三段式
   */
  consumeCard(bindingId: number, orderId: string): string | null {
    const consumeTx = this.db.transaction(() => {
      const card = this.db.prepare(
        'SELECT id, card_content FROM card_pool WHERE binding_id = ? AND status = \'unused\' ORDER BY id ASC LIMIT 1'
      ).get(bindingId) as any
      if (!card) return null
      this.db.prepare(
        'UPDATE card_pool SET status = \'used\', order_id = ?, used_at = datetime(\'now\') WHERE id = ?'
      ).run(orderId, card.id)
      this.db.prepare(
        'UPDATE product_bindings SET stock = stock - 1, delivered_count = delivered_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(bindingId)
      return card.card_content as string
    })
    return consumeTx()
  }

  /**
   * 链接卡密发货成功后记账：把已发 URL 标为已用并关联订单号，刷新池库存。
   * 本地池没有该 URL 时补插一条已用记录（云端直分配、未预先领取进池）。
   */
  markCardUrlUsed(bindingId: number, url: string, orderId: string): boolean {
    const content = String(url || '').trim()
    const oid = String(orderId || '').trim()
    if (!content || !oid || !bindingId) return false
    const tx = this.db.transaction(() => {
      const binding = this.db
        .prepare('SELECT id, pool_key, deliver_type, psy_test_code FROM product_bindings WHERE id = ?')
        .get(bindingId) as { id: number; pool_key: string; deliver_type: string; psy_test_code: string } | undefined
      if (!binding) return false
      const poolKey = this.computePoolKey(binding)

      let row = this.db
        .prepare(
          `SELECT id, status FROM card_pool
           WHERE card_content = ? AND (pool_key = ? OR binding_id = ?)
           LIMIT 1`
        )
        .get(content, poolKey, bindingId) as { id: number; status: string } | undefined

      if (!row) {
        const ins = this.db
          .prepare(
            `INSERT INTO card_pool (binding_id, pool_key, card_content, status, order_id, used_at)
             VALUES (?, ?, ?, 'used', ?, datetime('now'))`
          )
          .run(bindingId, poolKey, content, oid)
        row = { id: Number(ins.lastInsertRowid), status: 'unused' }
      } else if (row.status === 'used') {
        this.db
          .prepare(
            `UPDATE card_pool SET order_id = COALESCE(NULLIF(order_id, ''), ?),
               used_at = COALESCE(used_at, datetime('now'))
             WHERE id = ?`
          )
          .run(oid, row.id)
      } else {
        this.db
          .prepare(
            `UPDATE card_pool SET status = 'used', order_id = ?, used_at = datetime('now'), locked_at = NULL, pool_key = ?
             WHERE id = ?`
          )
          .run(oid, poolKey, row.id)
      }

      if (row.status === 'unused' || row.status === 'locked') {
        this.db
          .prepare(
            `UPDATE product_bindings SET delivered_count = delivered_count + 1, updated_at = datetime('now') WHERE id = ?`
          )
          .run(bindingId)
      }
      this.refreshPoolStock(poolKey)
      return true
    })
    return !!tx()
  }

  /**
   * 获取卡密池统计（共享池维度）
   */
  getCardPoolStats(bindingId: number) {
    const binding = this.db
      .prepare('SELECT pool_key, deliver_type, psy_test_code FROM product_bindings WHERE id = ?')
      .get(bindingId) as any
    const poolKey = binding ? this.computePoolKey(binding) : `binding:${bindingId}`
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ?').get(poolKey) as any).c
    const unused = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ? AND status = 'unused'`)
        .get(poolKey) as any
    ).c
    const used = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ? AND status = 'used'`)
        .get(poolKey) as any
    ).c
    const locked = (
      this.db
        .prepare(`SELECT COUNT(*) as c FROM card_pool WHERE pool_key = ? AND status = 'locked'`)
        .get(poolKey) as any
    ).c
    return { total, unused, used, locked, pool_key: poolKey }
  }

  /**
   * 获取卡密池列表（共享池维度）
   */
  getCardPoolList(bindingId: number, status?: string, limit: number = 50, offset: number = 0) {
    const binding = this.db
      .prepare('SELECT pool_key, deliver_type, psy_test_code FROM product_bindings WHERE id = ?')
      .get(bindingId) as any
    const poolKey = binding ? this.computePoolKey(binding) : `binding:${bindingId}`
    if (status && status !== 'all') {
      return this.db
        .prepare(
          'SELECT * FROM card_pool WHERE pool_key = ? AND status = ? ORDER BY id ASC LIMIT ? OFFSET ?'
        )
        .all(poolKey, status, limit, offset)
    }
    return this.db
      .prepare('SELECT * FROM card_pool WHERE pool_key = ? ORDER BY id ASC LIMIT ? OFFSET ?')
      .all(poolKey, limit, offset)
  }

  /** 缓存千帆同步的商品列表（切页/重开不丢） */
  saveSyncedGoods(shopId: string, goods: unknown[]): void {
    const sid = (shopId || 'default').trim() || 'default'
    const list = Array.isArray(goods) ? goods : []
    this.set(`synced_goods:${sid}`, { goods: list, syncedAt: new Date().toISOString() })
    this.logger.info(`[Storage] 已缓存同步商品: shop=${sid}, count=${list.length}`)
  }

  getSyncedGoods(shopId: string): { goods: any[]; syncedAt?: string } {
    const sid = (shopId || 'default').trim() || 'default'
    const raw = this.get<{ goods?: any[]; syncedAt?: string }>(`synced_goods:${sid}`)
    if (!raw || !Array.isArray(raw.goods)) return { goods: [] }
    return { goods: raw.goods, syncedAt: raw.syncedAt }
  }

  // ==================== 订单发货记录（对标阿奇锁 OrderImMsg，防重核心）====================

  /**
   * 幂等占位：按 (shop_id, order_id, msg_index) 落库。
   * @returns { isNew, msgGuid, sendStatus } — isNew=false 时复用已有 guid，禁止再用随机 guid 更新
   */
  claimOrGetDelivery(delivery: {
    shopId: string
    orderId: string
    productId?: string
    bindingId?: number
    msgGuid: string
    msgIndex?: number
    msgTotal?: number
  }): { isNew: boolean; msgGuid: string; sendStatus: string; msgIndex: number; msgTotal: number } {
    const msgIndex = delivery.msgIndex ?? 1
    const msgTotal = delivery.msgTotal ?? 1
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO order_delivery
          (shop_id, order_id, product_id, binding_id, msg_guid, msg_index, msg_total, send_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        delivery.shopId,
        delivery.orderId,
        delivery.productId || '',
        delivery.bindingId ?? null,
        delivery.msgGuid,
        msgIndex,
        msgTotal
      )
    if (result.changes === 1) {
      return { isNew: true, msgGuid: delivery.msgGuid, sendStatus: 'pending', msgIndex, msgTotal }
    }
    const row = this.db
      .prepare(
        `SELECT msg_guid, send_status, msg_index, msg_total FROM order_delivery
         WHERE order_id = ? AND msg_index = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(delivery.orderId, msgIndex) as
      | { msg_guid: string; send_status: string; msg_index: number; msg_total: number }
      | undefined
    if (!row) {
      // 极端：唯一冲突在 shop 维度不同；再插一次用新 guid 可能仍失败，返回入参兜底
      return { isNew: false, msgGuid: delivery.msgGuid, sendStatus: 'pending', msgIndex, msgTotal }
    }
    return {
      isNew: false,
      msgGuid: String(row.msg_guid),
      sendStatus: String(row.send_status || 'pending'),
      msgIndex: Number(row.msg_index) || msgIndex,
      msgTotal: Number(row.msg_total) || msgTotal
    }
  }

  /**
   * @deprecated 请用 claimOrGetDelivery；保留给旧调用
   */
  claimOrderDelivery(delivery: {
    shopId: string
    orderId: string
    productId?: string
    bindingId?: number
    msgGuid: string
    msgIndex?: number
    msgTotal?: number
  }): boolean {
    return this.claimOrGetDelivery(delivery).isNew
  }

  /**
   * 订单是否已存在发货记录（商家级：同订单号只发一次）
   */
  existsOrderDelivery(orderId: string, _shopId?: string): boolean {
    const row = this.db.prepare('SELECT id FROM order_delivery WHERE order_id = ? LIMIT 1').get(orderId)
    return !!row
  }

  /**
   * 整单是否已发完：1..msg_total 每条均为 success / rate_limited / disabled，且至少一条 success。
   * （替代「任意一条 success 就算发过」——避免缺轮话术却永久跳过）
   */
  hasShippedCode(orderId: string): boolean {
    return this.isOrderFullyShipped(orderId)
  }

  isOrderFullyShipped(orderId: string): boolean {
    const rows = this.db
      .prepare(
        `SELECT msg_index, msg_total, send_status FROM order_delivery WHERE order_id = ? ORDER BY msg_index ASC`
      )
      .all(orderId) as Array<{ msg_index: number; msg_total: number; send_status: string }>
    if (!rows.length) return false
    const total = Math.max(
      1,
      ...rows.map((r) => Number(r.msg_total) || 1),
      ...rows.map((r) => Number(r.msg_index) || 1)
    )
    const byIndex = new Map<number, string>()
    for (const r of rows) byIndex.set(Number(r.msg_index) || 1, String(r.send_status || ''))
    let hasSuccess = false
    for (let i = 1; i <= total; i++) {
      const st = byIndex.get(i)
      if (!st) return false
      if (st === 'success') hasSuccess = true
      else if (st === 'rate_limited' || st === 'disabled') {
        /* terminal skip for this index */
      } else {
        return false
      }
    }
    return hasSuccess
  }

  /** 指定 msg_index 之前（不含）有多少条 success */
  countPriorSuccess(orderId: string, msgIndex: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM order_delivery
         WHERE order_id = ? AND msg_index < ? AND send_status = 'success'`
      )
      .get(orderId, msgIndex) as { c: number }
    return Number(row?.c || 0)
  }

  /**
   * 近期是否有进行中的发码（sending/pending），用于防并发。
   * 不含 success——否则「第1条已成功」会挡住补发第2/3条。
   */
  hasRecentShippingActivity(orderId: string, withinSec = 600): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM order_delivery
         WHERE order_id = ?
           AND send_status IN ('sending', 'pending')
           AND datetime(updated_at) >= datetime('now', ?)
         LIMIT 1`
      )
      .get(orderId, `-${Math.max(30, withinSec)} seconds`)
    return !!row
  }

  /** 清除某订单发货占位（用于 Mock 假成功后重跑真发） */
  clearOrderDelivery(orderId: string): number {
    const r = this.db.prepare('DELETE FROM order_delivery WHERE order_id = ?').run(orderId)
    return r.changes
  }

  /** 仅清除指定状态（禁止误删 sending/success） */
  clearOrderDeliveryByStatuses(orderId: string, statuses: string[]): number {
    const list = (statuses || []).map((s) => String(s || '').trim()).filter(Boolean)
    if (!list.length) return 0
    const ph = list.map(() => '?').join(',')
    const r = this.db
      .prepare(`DELETE FROM order_delivery WHERE order_id = ? AND send_status IN (${ph})`)
      .run(orderId, ...list)
    return r.changes
  }

  /** 将超时的 pending/sending 标为 fail，允许后续 reclaim */
  reclaimStaleDeliveries(orderId: string, olderThanSec = 900): number {
    const r = this.db
      .prepare(
        `UPDATE order_delivery
         SET send_status = 'fail',
             error_msg = COALESCE(error_msg, '') || ' [stale_reclaim]',
             updated_at = datetime('now')
         WHERE order_id = ?
           AND send_status IN ('pending', 'sending')
           AND datetime(updated_at) < datetime('now', ?)`
      )
      .run(orderId, `-${Math.max(60, olderThanSec)} seconds`)
    return r.changes
  }

  /**
   * 台账中尚未整单发完的订单（供补单对账）
   */
  listLedgerNeedingShip(limit = 50): Array<{
    order_id: string
    shop_id: string
    product_id: string
    platform_status: string
    order_time: string
    is_virtual: number
  }> {
    const rows = this.db
      .prepare(
        `SELECT l.order_id, l.shop_id, l.product_id, l.platform_status, l.order_time, l.is_virtual
         FROM order_ledger l
         ORDER BY l.last_seen_at DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(500, limit * 4))) as any[]
    const out: any[] = []
    for (const row of rows) {
      if (this.isOrderFullyShipped(row.order_id)) continue
      out.push(row)
      if (out.length >= limit) break
    }
    return out
  }

  /**
   * 全量订单入台账（轮询到即写；已存在则刷新 last_seen）
   */
  upsertOrderLedger(row: {
    orderId: string
    shopId: string
    productId?: string
    platformStatus?: string
    platformStatusCode?: number | null
    orderTime?: string
    isVirtual?: boolean
  }): void {
    const orderId = String(row.orderId || '').trim()
    if (!orderId) return
    this.db
      .prepare(
        `INSERT INTO order_ledger
          (order_id, shop_id, product_id, platform_status, platform_status_code, order_time, is_virtual, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(order_id) DO UPDATE SET
           shop_id = excluded.shop_id,
           product_id = CASE WHEN excluded.product_id != '' THEN excluded.product_id ELSE order_ledger.product_id END,
           platform_status = excluded.platform_status,
           platform_status_code = excluded.platform_status_code,
           order_time = CASE WHEN excluded.order_time != '' THEN excluded.order_time ELSE order_ledger.order_time END,
           is_virtual = excluded.is_virtual,
           last_seen_at = datetime('now')`
      )
      .run(
        orderId,
        String(row.shopId || ''),
        String(row.productId || ''),
        String(row.platformStatus || ''),
        row.platformStatusCode ?? null,
        String(row.orderTime || ''),
        row.isVirtual ? 1 : 0
      )
  }

  /**
   * 按订单号查询发货记录（对标 GetByTidAsync）
   */
  getOrderDeliveries(orderId: string) {
    return this.db.prepare(
      'SELECT * FROM order_delivery WHERE order_id = ? ORDER BY msg_index ASC'
    ).all(orderId)
  }

  /**
   * 查询发货记录列表（按店铺 + 筛选条件）
   */
  getOrderDeliveriesList(filter: { shopId?: string; status?: string; limit?: number; offset?: number }) {
    const limit = filter.limit ?? 100
    const offset = filter.offset ?? 0
    const conds: string[] = []
    const values: any[] = []
    // 商家统一：不再按店过滤订单查询
    if (filter.status && filter.status !== 'all') {
      conds.push('send_status = ?')
      values.push(filter.status)
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const rows = this.db.prepare(
      `SELECT * FROM order_delivery ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...values, limit, offset)
    const totalRow = this.db.prepare(
      `SELECT COUNT(*) as c FROM order_delivery ${where}`
    ).get(...values) as any
    return { items: rows, total: totalRow?.c ?? 0 }
  }

  /**
   * 更新单条消息状态（按 msg_guid，对标 UpdateStatusByMsgGuidAsync）
   */
  updateDeliveryStatus(msgGuid: string, sendStatus: string, extra?: { errorMsg?: string; buyerUid?: string; cardContent?: string }) {
    const fields: string[] = ['send_status = ?', 'updated_at = datetime(\'now\')']
    const values: any[] = [sendStatus]
    if (extra?.errorMsg !== undefined) { fields.push('error_msg = ?'); values.push(extra.errorMsg) }
    if (extra?.buyerUid !== undefined) { fields.push('buyer_uid = ?'); values.push(extra.buyerUid) }
    if (extra?.cardContent !== undefined) { fields.push('card_content = ?'); values.push(extra.cardContent) }
    values.push(msgGuid)
    this.db.prepare(`UPDATE order_delivery SET ${fields.join(', ')} WHERE msg_guid = ?`).run(...values)
  }

  /**
   * 查询失败且可重试的订单（对标 GetFailedRetryableLogsAsync）
   */
  getFailedRetryableDeliveries(limit: number = 10, maxRetry: number = 3) {
    return this.db.prepare(
      `SELECT * FROM order_delivery
       WHERE send_status = 'fail' AND retry_count < ?
         AND IFNULL(error_msg, '') NOT LIKE '%连续发送%'
         AND IFNULL(error_msg, '') NOT LIKE '%不可超过%10%'
         AND IFNULL(error_msg, '') NOT LIKE '%超过10条%'
       ORDER BY updated_at ASC LIMIT ?`
    ).all(maxRetry, limit)
  }

  /**
   * 乐观锁抢占重试（对标 IncrementRetryCountAsync + WHERE SendStatus=?）
   * @returns true=抢占成功，可继续发送
   */
  tryClaimRetry(msgGuid: string): boolean {
    const result = this.db.prepare(
      `UPDATE order_delivery
       SET retry_count = retry_count + 1, send_status = 'sending', updated_at = datetime('now')
       WHERE msg_guid = ? AND send_status = 'fail'`
    ).run(msgGuid)
    return result.changes === 1
  }

  /**
   * 查询某订单未成功发送的消息（断点续发，对标 GetReissueMessagesAsync）
   */
  getUnsentDeliveries(orderId: string) {
    return this.db.prepare(
      `SELECT * FROM order_delivery
       WHERE order_id = ? AND send_status IN ('pending','fail')
       ORDER BY msg_index ASC`
    ).all(orderId)
  }

  /**
   * 作废订单消息（对标 DisableOrderImMsgAsync）
   */
  disableOrderDelivery(orderId: string): boolean {
    const result = this.db.prepare(
      `UPDATE order_delivery SET send_status = 'disabled', updated_at = datetime('now')
       WHERE order_id = ?`
    ).run(orderId)
    // 作废时回收该订单锁定的卡密
    this.rollbackCard(orderId)
    return result.changes > 0
  }

  close() {
    this.db.close()
  }
}