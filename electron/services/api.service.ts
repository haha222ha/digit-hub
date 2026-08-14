import express from 'express'
import { LoggerService } from './logger.service'

type StorageServiceLike = {
  get?: (key: string) => unknown
  getAllShopConfigs?: () => Array<{ shop_id?: string }>
  getReplyRules: (shopId: string) => unknown[]
}

/**
 * 本地 API 服务
 * - 对标原版 ASP.NET Core + Swagger
 * - 监听 127.0.0.1:19527
 * - 提供给内嵌浏览器页面调用的数据接口
 */
export class ApiService {
  private app = express()
  private server: any = null
  private readonly PORT = 19527
  private logger: LoggerService

  constructor(logger: LoggerService) {
    this.logger = logger
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware() {
    this.app.use(express.json())
    this.app.use((req, res, next) => {
      // 仅允许本地访问
      const ip = req.ip || req.socket.remoteAddress || ''
      if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      next()
    })

    // 请求日志
    this.app.use((req, _res, next) => {
      this.logger.info(`[API] ${req.method} ${req.url}`)
      next()
    })
  }

  private setupRoutes() {
    // 健康检查
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', version: process.env.npm_package_version })
    })

    // 设备信息
    this.app.get('/api/device/info', async (_req, res) => {
      try {
        // 通过全局 deviceService 获取
        const deviceService = (global as any).deviceService
        if (deviceService) {
          const info = await deviceService.getHardwareInfo()
          const code = await deviceService.getDeviceCode()
          res.json({ success: true, deviceCode: code, hardware: info })
        } else {
          res.status(503).json({ error: 'DeviceService not ready' })
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get device info' })
      }
    })

    // 授权状态
    this.app.get('/api/license/status', async (_req, res) => {
      try {
        const licenseService = (global as any).licenseService
        if (licenseService) {
          const status = await licenseService.getStatus()
          res.json(status)
        } else {
          res.status(503).json({ error: 'LicenseService not ready' })
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get license status' })
      }
    })

    // 配置管理
    this.app.get('/api/config/:key', (req, res) => {
      const storageService = (global as any).storageService
      if (storageService) {
        const value = storageService.get(req.params.key)
        res.json({ key: req.params.key, value })
      } else {
        res.status(503).json({ error: 'StorageService not ready' })
      }
    })

    this.app.post('/api/config/:key', (req, res) => {
      const storageService = (global as any).storageService
      if (storageService) {
        storageService.set(req.params.key, req.body.value)
        res.json({ success: true })
      } else {
        res.status(503).json({ error: 'StorageService not ready' })
      }
    })

    // WebSocket 状态
    this.app.get('/api/ws/status', (_req, res) => {
      const wsService = (global as any).wsService
      if (wsService) {
        res.json(wsService.getStatus())
      } else {
        res.status(503).json({ error: 'WebSocketService not ready' })
      }
    })

    // 发货日志
    this.app.get('/api/shipping/logs/:shopId', (req, res) => {
      const storageService = (global as any).storageService
      if (storageService) {
        const limit = parseInt(req.query.limit as string) || 100
        const logs = storageService.getShipLogs(req.params.shopId, limit)
        res.json(logs)
      } else {
        res.status(503).json({ error: 'StorageService not ready' })
      }
    })

    // 自动发货接口（由注入脚本调用）
    this.app.post('/api/shipping/auto-ship', async (req, res) => {
      const { orderId, productId } = req.body
      this.logger.info(`[API] 自动发货请求: orderId=${orderId}`)
      const autoShipService = (global as any).autoShipService
      if (autoShipService && orderId) {
        await autoShipService.handleNewOrder({
          order_id: orderId,
          product_id: productId,
          status: 'paid',
          source: 'api'
        })
        res.json({ success: true, message: '发货已触发', orderId })
      } else {
        res.status(503).json({ error: 'AutoShipService not ready' })
      }
    })

    this.app.post('/api/shipping/prepare-im', async (_req, res) => {
      const fn = (global as any).prepareImVisible
      if (!fn) return res.status(503).json({ error: 'prepareImVisible not ready' })
      try {
        const out = await fn()
        res.json({ success: true, ...out })
      } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message || String(e) })
      }
    })

    this.app.get('/api/shipping/im-health', async (_req, res) => {
      const autoShipService = (global as any).autoShipService
      if (!autoShipService) return res.status(503).json({ error: 'AutoShipService not ready' })
      const health = await autoShipService.refreshImHealth()
      res.json({ success: true, health })
    })

    this.app.get('/api/shipping/csbridge-diag', async (_req, res) => {
      const autoShipService = (global as any).autoShipService
      if (!autoShipService) return res.status(503).json({ error: 'AutoShipService not ready' })
      const report = await autoShipService.runCsBridgeDiag()
      res.json({ success: !!report, report })
    })

    this.app.get('/api/debug/deep-probe-rim', async (_req, res) => {
      const autoShipService = (global as any).autoShipService
      if (!autoShipService) return res.status(503).json({ error: 'AutoShipService not ready' })
      const report = await autoShipService.runDeepProbeRim()
      res.json({ success: !!report, report })
    })

    this.app.post('/api/debug/test-deliver', async (req, res) => {
      const autoShipService = (global as any).autoShipService
      if (!autoShipService) return res.status(503).json({ error: 'AutoShipService not ready' })
      const orderId = String(req.body?.orderId || '80223388178802120')
      const content = String(req.body?.content || '【测试消息】自动发货链路验证')
      try {
        const out = await autoShipService.debugDeliver(orderId, content)
        res.json({ success: true, ...out })
      } catch (e: any) {
        res.status(500).json({ success: false, error: e?.message || String(e) })
      }
    })

    this.app.post('/api/debug/open-devtools', async (_req, res) => {
      const fn = (global as any).openWorkbenchDevTools
      if (!fn) return res.status(503).json({ error: 'openWorkbenchDevTools not ready' })
      const out = await fn()
      res.json({ success: !!out.ok, ...out })
    })

    this.app.post('/api/debug/capture-start', async (req, res) => {
      const netCaptureService = (global as any).netCaptureService
      const xhsBrowserView = (global as any).xhsBrowserViewRef
      if (!netCaptureService) return res.status(503).json({ error: 'NetCaptureService not ready' })
      const wc = xhsBrowserView?.webContents
      if (!wc || wc.isDestroyed()) return res.status(503).json({ error: 'BrowserView not ready' })
      const tag = String(req.body?.tag || 'manual-chat')
      const out = await netCaptureService.start(wc, tag)
      res.json({ success: out.ok, ...out })
    })

    this.app.post('/api/debug/capture-stop', async (_req, res) => {
      const netCaptureService = (global as any).netCaptureService
      if (!netCaptureService) return res.status(503).json({ error: 'NetCaptureService not ready' })
      const out = await netCaptureService.stop()
      res.json({ success: true, ...out })
    })

    this.app.get('/api/debug/capture-status', (_req, res) => {
      const netCaptureService = (global as any).netCaptureService
      if (!netCaptureService) return res.status(503).json({ error: 'NetCaptureService not ready' })
      res.json({
        active: netCaptureService.isActive(),
        logFile: netCaptureService.getLogFile(),
        count: netCaptureService.getEntryCount()
      })
    })

    // 自动回复匹配（注入脚本 kefu-monitor 调用）
    this.app.post('/api/reply/match', (req, res) => {
      const { content, shopId } = req.body || {}
      const reply = this.matchReplyRule(String(content || ''), shopId ? String(shopId) : undefined)
      res.json({ reply })
    })

    // 回复规则管理
    this.app.get('/api/reply/rules/:shopId', (req, res) => {
      const storageService = (global as any).storageService
      if (storageService) {
        const rules = storageService.getReplyRules(req.params.shopId)
        res.json(rules)
      } else {
        res.status(503).json({ error: 'StorageService not ready' })
      }
    })

    // 健康检查（Swagger 替代）
    this.app.get('/api/docs', (_req, res) => {
      res.json({
        title: '小红书发货助手 API',
        version: '1.0.0',
        endpoints: [
          'GET  /api/health',
          'GET  /api/device/info',
          'GET  /api/license/status',
          'GET  /api/config/:key',
          'POST /api/config/:key',
          'GET  /api/ws/status',
          'GET  /api/shipping/logs/:shopId',
          'POST /api/shipping/auto-ship',
          'POST /api/reply/match',
          'GET  /api/reply/rules/:shopId',
          'GET  /api/products/bindings/:shopId',
          'POST /api/products/bindings',
          'GET  /api/products/cards/stats/:bindingId',
          'GET  /api/products/cards/:bindingId',
          'GET  /api/orders/deliveries',
          'GET  /api/orders/deliveries/:orderId',
          'POST /api/orders/deliveries/:orderId/resend',
          'POST /api/orders/deliveries/:orderId/disable'
        ]
      })
    })

    // Swagger/OpenAPI JSON（对标原版 Swashbuckle）
    this.app.get('/api/swagger.json', (_req, res) => {
      res.json(this.getSwaggerSpec())
    })

    // Swagger UI HTML（使用官方 CDN）
    this.app.get('/api/swagger-ui', (_req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.send(this.getSwaggerUIHtml())
    })

    // 商品绑定接口
    this.app.get('/api/products/bindings/:shopId', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const bindings = storageService.getAllProductBindings(req.params.shopId)
      res.json(bindings)
    })

    this.app.post('/api/products/bindings', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const id = storageService.addProductBinding(req.body)
      res.json({ success: true, id })
    })

    this.app.get('/api/products/cards/stats/:bindingId', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const stats = storageService.getCardPoolStats(parseInt(req.params.bindingId))
      res.json(stats)
    })

    this.app.get('/api/products/cards/:bindingId', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const status = (req.query.status as string) || 'all'
      const limit = parseInt(req.query.limit as string) || 50
      const offset = parseInt(req.query.offset as string) || 0
      const list = storageService.getCardPoolList(parseInt(req.params.bindingId), status, limit, offset)
      res.json(list)
    })

    // ==================== 订单发卡管理（对标阿奇锁 OrderImMsgController）====================
    // 按订单号/状态筛选查询发卡记录
    this.app.get('/api/orders/deliveries', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const { shopId, status, limit, offset } = req.query
      const result = storageService.getOrderDeliveriesList({
        shopId: (shopId as string) || '',
        status: (status as string) || 'all',
        limit: parseInt(limit as string) || 100,
        offset: parseInt(offset as string) || 0
      })
      res.json({ success: true, ...result })
    })

    // 按订单号查单笔发卡详情
    this.app.get('/api/orders/deliveries/:orderId', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const items = storageService.getOrderDeliveries(req.params.orderId)
      if (!items || items.length === 0) {
        return res.json({ success: false, code: 'MESSAGE_NOT_FOUND', message: '发货消息不存在' })
      }
      res.json({ success: true, items })
    })

    // 手动重发
    this.app.post('/api/orders/deliveries/:orderId/resend', async (req, res) => {
      const storageService = (global as any).storageService
      const autoShipService = (global as any).autoShipService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const items = storageService.getOrderDeliveries(req.params.orderId)
      if (!items || items.length === 0) {
        return res.json({ success: false, code: 'MESSAGE_NOT_FOUND', message: '发货消息不存在' })
      }
      const anyDisabled = items.some((it: any) => it.send_status === 'disabled')
      if (anyDisabled) {
        return res.json({ success: false, code: 'MESSAGE_DISABLED', message: '消息已作废，无法重发' })
      }
      const retried = await autoShipService.retryFailedDeliveries()
      res.json({ success: true, message: `已加入发送队列`, retried })
    })

    // 作废
    this.app.post('/api/orders/deliveries/:orderId/disable', (req, res) => {
      const storageService = (global as any).storageService
      if (!storageService) return res.status(503).json({ error: 'StorageService not ready' })
      const changed = storageService.disableOrderDelivery(req.params.orderId)
      res.json({ success: changed, message: changed ? '作废成功' : '发货消息不存在' })
    })

    // 错误处理
    this.app.use((err: any, _req: any, res: any, _next: any) => {
      this.logger.error('[API] 错误:', err)
      res.status(500).json({ error: err.message || 'Internal Server Error' })
    })
  }

  start() {
    this.server = this.app.listen(this.PORT, '127.0.0.1', () => {
      this.logger.info(`[API] 本地服务已启动: http://127.0.0.1:${this.PORT}`)
    })

    // 处理端口占用错误（对标原版异常容错）
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.error(`[API] 端口 ${this.PORT} 已被占用，可能已有实例在运行`)
        this.logger.info('[API] 尝试关闭旧服务并重试...')
        this.killProcessOnPort(this.PORT)
          .then(() => {
            // 等待端口释放后重试一次
            setTimeout(() => {
              try {
                this.server = this.app.listen(this.PORT, '127.0.0.1', () => {
                  this.logger.info(`[API] 本地服务已重启: http://127.0.0.1:${this.PORT}`)
                })
              } catch (e) {
                this.logger.error('[API] 重启失败:', e)
              }
            }, 1000)
          })
          .catch((e) => {
            this.logger.error('[API] 无法释放端口，本地服务启动失败:', e)
          })
      } else {
        this.logger.error('[API] 服务异常:', err)
      }
    })
  }

  /**
   * 杀掉占用指定端口的进程（Windows）
   */
  private killProcessOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process')
      // 查找占用端口的 PID
      exec(`netstat -ano | findstr :${port}`, (findErr: Error | null, stdout: string) => {
        if (findErr || !stdout) {
          resolve()
          return
        }
        // 解析 PID（最后一列）
        const lines = stdout.trim().split('\n')
        const pids = new Set<string>()
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          // 排除 0 (系统空闲) 和当前进程
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            pids.add(pid)
          }
        }
        if (pids.size === 0) {
          resolve()
          return
        }
        this.logger.info(`[API] 发现占用进程 PID: ${Array.from(pids).join(', ')}`)
        // 终止进程
        const pidList = Array.from(pids).join(' /PID ')
        exec(`taskkill /F /PID ${pidList}`, (killErr: Error | null) => {
          if (killErr) {
            this.logger.warn(`[API] 终止进程失败: ${killErr.message}`)
            reject(killErr)
          } else {
            this.logger.info('[API] 旧进程已终止')
            resolve()
          }
        })
      })
    })
  }

  stop() {
    if (this.server) {
      try {
        this.server.close()
        this.logger.info('[API] 本地服务已停止')
      } catch (e) {
        this.logger.error('[API] 停止服务异常', e)
      }
    }
  }

  /**
   * 匹配回复规则：需开启自动回复；按当前店（可传 shopId）；长关键词优先。
   */
  private matchReplyRule(content: string, shopId?: string): string | null {
    const text = String(content || '').trim()
    if (!text) return null
    const storageService = (global as { storageService?: StorageServiceLike }).storageService
    if (!storageService) return null

    try {
      if (storageService.get?.('autoReplyEnabled') !== true) return null

      const sid =
        String(shopId || '').trim() ||
        String(storageService.get?.('currentShopId') || '').trim()
      const shopIds = sid
        ? [sid]
        : (storageService.getAllShopConfigs?.() || []).map((s) => String(s.shop_id || '')).filter(Boolean)

      const hits: Array<{ keyword: string; reply: string }> = []
      for (const id of shopIds) {
        const rules = (storageService.getReplyRules(id) || []) as Array<{
          keyword?: string
          reply_text?: string
          enabled?: number | boolean
        }>
        for (const rule of rules) {
          const kw = String(rule.keyword || '').trim()
          if (!kw) continue
          if (text.includes(kw)) hits.push({ keyword: kw, reply: String(rule.reply_text || '') })
        }
      }
      hits.sort((a, b) => b.keyword.length - a.keyword.length)
      const best = hits.find((h) => h.reply)
      if (best) {
        this.logger.info(`[API] 自动回复命中 keyword=${best.keyword}`)
        return best.reply
      }
    } catch (error) {
      this.logger.error('[API] 回复规则匹配失败:', error)
    }

    return null
  }

  /**
   * 生成 OpenAPI 3.0 规范（对标原版 Swashbuckle）
   */
  private getSwaggerSpec() {
    return {
      openapi: '3.0.0',
      info: {
        title: '小红书发货助手 API',
        description: '本地 HTTP API - 供注入脚本与外部工具调用',
        version: '1.0.0'
      },
      servers: [
        { url: `http://127.0.0.1:${this.PORT}`, description: '本地服务' }
      ],
      paths: {
        '/api/health': {
          get: { summary: '健康检查', tags: ['系统'], responses: { '200': { description: 'OK' } } }
        },
        '/api/device/info': {
          get: { summary: '获取设备信息', tags: ['设备'], responses: { '200': { description: 'OK' } } }
        },
        '/api/license/status': {
          get: { summary: '获取授权状态', tags: ['授权'], responses: { '200': { description: 'OK' } } }
        },
        '/api/config/{key}': {
          get: { summary: '获取配置', tags: ['配置'], parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
          post: { summary: '设置配置', tags: ['配置'], parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { value: {} } } } } }, responses: { '200': { description: 'OK' } } }
        },
        '/api/ws/status': {
          get: { summary: '获取 WebSocket 状态', tags: ['WebSocket'], responses: { '200': { description: 'OK' } } }
        },
        '/api/shipping/logs/{shopId}': {
          get: { summary: '获取发货日志', tags: ['发货'], parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/shipping/auto-ship': {
          post: { summary: '触发自动发货', tags: ['发货'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { orderId: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' } } }
        },
        '/api/reply/match': {
          post: { summary: '匹配自动回复', tags: ['客服'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' } } }
        },
        '/api/reply/rules/{shopId}': {
          get: { summary: '获取回复规则', tags: ['客服'], parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/products/bindings/{shopId}': {
          get: { summary: '获取商品绑定列表', tags: ['商品'], parameters: [{ name: 'shopId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/products/bindings': {
          post: { summary: '新增商品绑定', tags: ['商品'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { shopId: { type: 'string' }, productId: { type: 'string' }, productName: { type: 'string' }, productType: { type: 'string', enum: ['virtual', 'physical'] }, deliverType: { type: 'string', enum: ['card', 'text', 'link', 'manual'] }, deliverContent: { type: 'string' }, stock: { type: 'integer' } } } } } }, responses: { '200': { description: 'OK' } } }
        },
        '/api/products/cards/stats/{bindingId}': {
          get: { summary: '获取卡密池统计', tags: ['商品'], parameters: [{ name: 'bindingId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/products/cards/{bindingId}': {
          get: { summary: '获取卡密池列表', tags: ['商品'], parameters: [{ name: 'bindingId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/orders/deliveries': {
          get: { summary: '查询发卡记录列表', tags: ['订单发卡'], parameters: [{ name: 'shopId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/orders/deliveries/{orderId}': {
          get: { summary: '按订单号查发卡详情', tags: ['订单发卡'], parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/orders/deliveries/{orderId}/resend': {
          post: { summary: '手动重发', tags: ['订单发卡'], parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        },
        '/api/orders/deliveries/{orderId}/disable': {
          post: { summary: '作废订单消息', tags: ['订单发卡'], parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } }
        }
      },
      tags: [
        { name: '系统' }, { name: '设备' }, { name: '授权' }, { name: '配置' },
        { name: 'WebSocket' }, { name: '发货' }, { name: '客服' }, { name: '商品' }, { name: '订单发卡' }
      ]
    }
  }

  /**
   * Swagger UI HTML（使用官方 CDN）
   */
  private getSwaggerUIHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>小红书发货助手 API 文档</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/api/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`
  }
}