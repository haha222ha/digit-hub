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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_shop_order ON order_delivery(shop_id, order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_guid ON order_delivery(msg_guid);
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
      `ALTER TABLE product_bindings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`,
      `ALTER TABLE card_pool ADD COLUMN locked_at TEXT`,
      `ALTER TABLE card_pool ADD COLUMN order_id TEXT`,
      `ALTER TABLE card_pool ADD COLUMN used_at TEXT`,
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
    try {
      this.db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_product_bindings_shop_pid ON product_bindings(shop_id, product_id)'
      )
    } catch {
      /* 若已有重复绑定则跳过，查询仍按 shop_id+product_id */
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
    return this.db.prepare(
      'SELECT * FROM ship_log WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(shopId, limit)
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
    shopId: string
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
  }): number {
    const result = this.db.prepare(
      `INSERT INTO product_bindings
        (shop_id, product_id, product_name, product_type, deliver_type, deliver_content, stock,
         random_mode, low_stock_alert, send_interval_ms, uid_length, msg_separator, psy_test_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      binding.shopId,
      binding.productId,
      binding.productName || '',
      binding.productType || 'virtual',
      binding.deliverType || 'card',
      binding.deliverContent,
      binding.stock || 0,
      binding.randomMode ? 1 : 0,
      binding.lowStockAlert ?? 10,
      binding.sendIntervalMs ?? 500,
      binding.uidLength ?? 10,
      binding.msgSeparator ?? '\n\n',
      binding.psyTestCode || ''
    )
    this.logger.info(`[Storage] 新增商品绑定: productId=${binding.productId}, id=${result.lastInsertRowid}`)
    return Number(result.lastInsertRowid)
  }

  /**
   * 批量添加卡密到卡密池（自动去重，跳过已存在的卡密）
   * @returns 实际新增数量
   */
  addCardPool(bindingId: number, cards: string[], options?: { skipDuplicate?: boolean }): number {
    if (cards.length === 0) return 0
    const skipDuplicate = options?.skipDuplicate ?? true

    // 去重：仅保留「该绑定下不存在」的卡密内容
    const existing = this.db.prepare(
      'SELECT card_content FROM card_pool WHERE binding_id = ?'
    ).all(bindingId) as { card_content: string }[]
    const existingSet = new Set(existing.map((r) => r.card_content))

    const toInsert = skipDuplicate
      ? cards.filter((c) => c && !existingSet.has(c))
      : cards.filter((c) => !!c)

    if (toInsert.length === 0) {
      this.logger.info(`[Storage] 卡密全部重复，跳过: bindingId=${bindingId}`)
      return 0
    }

    const stmt = this.db.prepare(
      'INSERT INTO card_pool (binding_id, card_content) VALUES (?, ?)'
    )
    const tx = this.db.transaction((items: string[]) => {
      for (const c of items) stmt.run(bindingId, c)
    })
    tx(toInsert)
    // 更新库存
    this.db.prepare(
      'UPDATE product_bindings SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(toInsert.length, bindingId)
    this.logger.info(`[Storage] 批量添加卡密: bindingId=${bindingId}, count=${toInsert.length}, 去重跳过=${cards.length - toInsert.length}`)
    return toInsert.length
  }

  /**
   * 获取商品绑定（按商品ID）
   */
  getProductBinding(shopId: string, productId: string): any | null {
    const row = this.db.prepare(
      'SELECT * FROM product_bindings WHERE shop_id = ? AND product_id = ? AND enabled = 1'
    ).get(shopId, productId) as any
    if (!row) return null
    return {
      ...row,
      enabled: !!row.enabled,
      product_type: row.product_type,
      deliver_type: row.deliver_type
    }
  }

  /**
   * 获取所有商品绑定
   */
  getAllProductBindings(shopId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM product_bindings WHERE shop_id = ? ORDER BY updated_at DESC'
    ).all(shopId) as any[]
    return rows.map((r) => ({ ...r, enabled: !!r.enabled }))
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
    if (fields.length === 0) return false
    fields.push('updated_at = datetime(\'now\')')
    values.push(id)
    const result = this.db.prepare(
      `UPDATE product_bindings SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)
    return result.changes > 0
  }

  /**
   * 删除商品绑定（同时删除卡密池）
   */
  deleteProductBinding(id: number): boolean {
    const result = this.db.prepare('DELETE FROM product_bindings WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM card_pool WHERE binding_id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 锁定一张卡密（两段式第一步：锁定，防并发重复取）
   * 对标阿奇锁 locked 中间态
   * @returns 卡密内容，无可用卡密返回 null
   */
  lockCard(bindingId: number, orderId: string, random: boolean = false): string | null {
    const lockTx = this.db.transaction(() => {
      const orderBy = random ? 'ORDER BY RANDOM()' : 'ORDER BY id ASC'
      const card = this.db.prepare(
        `SELECT id, card_content FROM card_pool WHERE binding_id = ? AND status = 'unused' ${orderBy} LIMIT 1`
      ).get(bindingId) as any
      if (!card) return null
      this.db.prepare(
        'UPDATE card_pool SET status = \'locked\', order_id = ?, locked_at = datetime(\'now\') WHERE id = ?'
      ).run(orderId, card.id)
      return card.card_content as string
    })
    return lockTx()
  }

  /**
   * 确认卡密已使用（两段式第二步：发送成功后）
   */
  confirmCard(orderId: string): void {
    this.db.prepare(
      'UPDATE card_pool SET status = \'used\', used_at = datetime(\'now\'), locked_at = NULL WHERE order_id = ? AND status = \'locked\''
    ).run(orderId)
    // 更新库存与发货计数
    const row = this.db.prepare(
      'SELECT binding_id FROM card_pool WHERE order_id = ?'
    ).get(orderId) as any
    if (row?.binding_id) {
      this.db.prepare(
        'UPDATE product_bindings SET stock = stock - 1, delivered_count = delivered_count + 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(row.binding_id)
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
   * 将本地卡密池中与云端 URL 相同的条目标为已用（避免双扣）。
   * 若本地没有该 URL，返回 false（仍可仅靠 order_delivery 记履约）。
   */
  markCardUrlUsed(bindingId: number, url: string, orderId: string): boolean {
    const content = String(url || '').trim()
    const oid = String(orderId || '').trim()
    if (!content || !oid) return false
    const tx = this.db.transaction(() => {
      const row = this.db.prepare(
        `SELECT id, status FROM card_pool
         WHERE binding_id = ? AND card_content = ?`
      ).get(bindingId, content) as { id: number; status: string } | undefined
      if (!row) return false
      if (row.status === 'used') {
        this.db.prepare(
          `UPDATE card_pool SET order_id = COALESCE(order_id, ?), used_at = COALESCE(used_at, datetime('now'))
           WHERE id = ?`
        ).run(oid, row.id)
        return true
      }
      this.db.prepare(
        `UPDATE card_pool SET status = 'used', order_id = ?, used_at = datetime('now'), locked_at = NULL
         WHERE id = ?`
      ).run(oid, row.id)
      if (row.status === 'unused' || row.status === 'locked') {
        this.db.prepare(
          `UPDATE product_bindings SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE 0 END,
             delivered_count = delivered_count + 1, updated_at = datetime('now') WHERE id = ?`
        ).run(bindingId)
      }
      return true
    })
    return !!tx()
  }

  /**
   * 获取卡密池统计
   */
  getCardPoolStats(bindingId: number) {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM card_pool WHERE binding_id = ?').get(bindingId) as any).c
    const unused = (this.db.prepare('SELECT COUNT(*) as c FROM card_pool WHERE binding_id = ? AND status = \'unused\'').get(bindingId) as any).c
    const used = (this.db.prepare('SELECT COUNT(*) as c FROM card_pool WHERE binding_id = ? AND status = \'used\'').get(bindingId) as any).c
    const locked = (this.db.prepare('SELECT COUNT(*) as c FROM card_pool WHERE binding_id = ? AND status = \'locked\'').get(bindingId) as any).c
    return { total, unused, used, locked }
  }

  /**
   * 获取卡密池列表（分页 + 状态筛选）
   */
  getCardPoolList(bindingId: number, status?: string, limit: number = 50, offset: number = 0) {
    if (status && status !== 'all') {
      return this.db.prepare(
        'SELECT * FROM card_pool WHERE binding_id = ? AND status = ? ORDER BY id ASC LIMIT ? OFFSET ?'
      ).all(bindingId, status, limit, offset)
    }
    return this.db.prepare(
      'SELECT * FROM card_pool WHERE binding_id = ? ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(bindingId, limit, offset)
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
   * 幂等占位：订单发货记录落库
   * @returns true=首次处理该订单；false=该订单已存在（已发过/处理中），应跳过
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
    const result = this.db.prepare(
      `INSERT OR IGNORE INTO order_delivery
        (shop_id, order_id, product_id, binding_id, msg_guid, msg_index, msg_total, send_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      delivery.shopId,
      delivery.orderId,
      delivery.productId || '',
      delivery.bindingId ?? null,
      delivery.msgGuid,
      delivery.msgIndex ?? 1,
      delivery.msgTotal ?? 1
    )
    return result.changes === 1
  }

  /**
   * 订单是否已存在发货记录（处理前判重，对标 GetByTidAsync）
   */
  existsOrderDelivery(orderId: string, shopId?: string): boolean {
    if (shopId) {
      const row = this.db.prepare(
        'SELECT id FROM order_delivery WHERE order_id = ? AND shop_id = ? LIMIT 1'
      ).get(orderId, shopId)
      return !!row
    }
    const row = this.db.prepare(
      'SELECT id FROM order_delivery WHERE order_id = ? LIMIT 1'
    ).get(orderId)
    return !!row
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
    if (filter.shopId) { conds.push('shop_id = ?'); values.push(filter.shopId) }
    if (filter.status && filter.status !== 'all') { conds.push('send_status = ?'); values.push(filter.status) }
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