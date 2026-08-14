/**
 * 虚拟发货 IM 桥 — 对标阿奇锁 IMSend.js
 * 依赖页面已加载 window.XhsRim（客服工作台 /cstools/chat）
 *
 * 暴露：window.__xhsAssistant.im
 */
(function () {
  // 版本号变更时允许热更新（否则旧 fetchPendingOrders 会一直空列表）
  var SCRIPT_VER = 'order-poll-v2'
  if (window.__xhsImSendReady === SCRIPT_VER) return
  window.__xhsImSendReady = SCRIPT_VER

  function getAccessToken() {
    return (
      localStorage.getItem('accessToken') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('auth-token') ||
      ''
    )
  }

  function getSellerId() {
    try {
      const fromLs =
        localStorage.getItem('sellerId') ||
        localStorage.getItem('seller_id') ||
        localStorage.getItem('bUserId') ||
        ''
      if (fromLs) return fromLs
      const m = document.cookie.match(/(?:^|;\s*)walle-eva-bUserId=([^;]+)/)
      return m ? decodeURIComponent(m[1]) : ''
    } catch {
      return ''
    }
  }

  function buildSignHeaders(apiPath, opts) {
    opts = opts || {}
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    }
    // 客服域走 eva；千帆 ark 订单页 HAR 无 x-subsystem，勿硬塞
    if (opts.subsystem) headers['x-subsystem'] = opts.subsystem
    const token = getAccessToken()
    if (token) headers.Authorization = token.startsWith('Bearer') ? token : `Bearer ${token}`
    try {
      if (typeof window._webmsxyw === 'function') {
        const sign = window._webmsxyw(apiPath)
        if (sign && typeof sign === 'object') {
          Object.assign(headers, sign)
        } else if (typeof sign === 'string' && sign) {
          headers['X-s'] = sign
        }
      }
    } catch (e) {
      console.warn('[IMSend] _webmsxyw 签名失败', e)
    }
    return headers
  }

  async function apiGet(path) {
    const headers = buildSignHeaders(path, { subsystem: 'eva' })
    const res = await fetch('https://walle.xiaohongshu.com' + path, {
      method: 'GET',
      credentials: 'include',
      headers
    })
    return res.json()
  }

  async function apiPost(path, body) {
    const headers = buildSignHeaders(path, { subsystem: 'eva' })
    const res = await fetch('https://walle.xiaohongshu.com' + path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body || {})
    })
    return res.json()
  }

  /** 订单号 → 买家客户 ID（对标 getUserByOrderSn） */
  async function getUserByOrderSn(orderSn) {
    const sellerId = getSellerId()
    const path =
      '/api/edith/mcs/search_customer?seller_id=' +
      encodeURIComponent(sellerId || '') +
      '&keyword=' +
      encodeURIComponent(String(orderSn).trim()) +
      '&page_no=1&page_size=5'
    const data = await apiGet(path)
    const list = data?.data?.search_results || data?.data?.list || data?.data || []
    const first = Array.isArray(list) ? list[0] : null
    return first?.id || first?.user_id || first?.customer_id || null
  }

  /** 订单号 → 买家昵称（供模板 {买家昵称} 替换） */
  async function getBuyerNameByOrderSn(orderSn) {
    const sellerId = getSellerId()
    const path =
      '/api/edith/mcs/search_customer?seller_id=' +
      encodeURIComponent(sellerId || '') +
      '&keyword=' +
      encodeURIComponent(String(orderSn).trim()) +
      '&page_no=1&page_size=5'
    const data = await apiGet(path)
    const list = data?.data?.search_results || data?.data?.list || data?.data || []
    const first = Array.isArray(list) ? list[0] : null
    return (
      first?.nickname ||
      first?.nick_name ||
      first?.user_name ||
      first?.name ||
      first?.display_name ||
      ''
    )
  }

  /**
   * 买家 ID → chatId。getChatInfo 会打开/创建与该买家的会话（无需买家先开口）。
   * 对标阿奇锁 getUserByOrderSnChatId / XhsRim.getChatInfo
   */
  async function getChatId(buyerId, orderSn) {
    if (!window.XhsRim || !window.XhsRim.rimSdk) {
      throw new Error('XhsRim 未就绪：请打开客服聊天页 /cstools/chat')
    }
    const arg1 = buyerId
    const arg2 = orderSn || buyerId
    let chatInfo = await window.XhsRim.rimSdk.getChatInfo(arg1, arg2)
    let chatId = chatInfo?.data?.id || chatInfo?.id || null
    if (!chatId) {
      chatInfo = await window.XhsRim.rimSdk.getChatInfo(arg1)
      chatId = chatInfo?.data?.id || chatInfo?.id || null
    }
    return chatId
  }

  async function sendTextMsg(content, chatId) {
    if (!window.XhsRim || typeof window.XhsRim.sendTextMsg !== 'function') {
      throw new Error('XhsRim.sendTextMsg 不可用')
    }
    return window.XhsRim.sendTextMsg(String(content), { chatId })
  }

  async function sendImageMsg(fileOrUrl, chatId) {
    if (!window.XhsRim || typeof window.XhsRim.sendImageMsg !== 'function') {
      throw new Error('XhsRim.sendImageMsg 不可用')
    }
    // 若为 URL，需先抓取为 File（对标阿奇锁 IMSend.js：new File([blob], 'PC-IMG-...')）
    if (typeof fileOrUrl === 'string' && /^https?:\/\//.test(fileOrUrl)) {
      const blob = await fetch(fileOrUrl).then((r) => r.blob())
      const f = new File([blob], 'PC-IMG-' + Date.now(), { type: blob.type || 'image/png' })
      return window.XhsRim.sendImageMsg(f, { chatId })
    }
    return window.XhsRim.sendImageMsg(fileOrUrl, { chatId })
  }

  async function sendVideoMsg(content, chatId) {
    // 对标阿奇锁 sendCustomMsg(content_type: 73)
    if (!window.XhsRim || typeof window.XhsRim.sendCustomMsg !== 'function') {
      throw new Error('XhsRim.sendCustomMsg 不可用')
    }
    return window.XhsRim.sendCustomMsg({ content, content_type: 73 }, { chatId })
  }

  async function sendNotesMsg(content, chatId) {
    // 对标阿奇锁 sendCustomNotesMsg(content_type: 92)：发送笔记/网址链接（发货凭证）
    if (!window.XhsRim || typeof window.XhsRim.sendCustomMsg !== 'function') {
      throw new Error('XhsRim.sendCustomMsg 不可用')
    }
    const payload = { content, content_type: 92 }
    const options = {
      chatId,
      manualInsertFn: function (msgObj, utils) {
        if (utils && typeof utils.appendMsg === 'function') {
          utils.appendMsg(msgObj)
        }
      }
    }
    return window.XhsRim.sendCustomMsg(payload, options)
  }

  /**
   * 一站式：订单号 → 找买家 → 自动开会话 → 发消息（文本/图片/视频）
   * 买家未先发消息也可以发起，对标阿奇锁主动虚拟发货。
   */
  async function deliverByOrderSn(orderSn, content, type) {
    type = type || 'text'
    const buyerId = await getUserByOrderSn(orderSn)
    if (!buyerId) {
      return { success: false, error: 'search_customer 未找到买家: ' + orderSn }
    }
    const buyerName = await getBuyerNameByOrderSn(orderSn)
    const chatId = await getChatId(buyerId, orderSn)
    if (!chatId) {
      return { success: false, error: 'getChatInfo 未返回 chatId, buyerId=' + buyerId }
    }
    if (type === 'image') {
      await sendImageMsg(content, chatId)
    } else if (type === 'video') {
      await sendVideoMsg(content, chatId)
    } else if (type === 'note' || type === 'link') {
      await sendNotesMsg(content, chatId)
    } else {
      await sendTextMsg(content, chatId)
    }
    return {
      success: true,
      buyerId,
      buyerName,
      chatId,
      trackingNumber: String(content).slice(0, 80)
    }
  }

  /**
   * 拉取待发货/待虚拟发卡订单
   * 请求体对齐千帆后台 HAR：POST /api/edith/fulfillment/order/page
   * 旧版 status:2（数字）会被接口当成非法筛选 → packages=[] → 本地零动作
   * HAR 成功样例：status:[]（数组）+ time_range_list.time_type=3 + camelCase packages.orderId/skus[].itemId
   */
  async function fetchPendingOrders(opts) {
    opts = opts || {}
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    // time_type:3 = 按下单/支付时间；正常近 3 天，补拉近 7 天
    const lookbackDays = opts.recover ? 7 : 3
    const start = Number(opts.startTime) || now - lookbackDays * dayMs
    const end = Number(opts.endTime) || now + dayMs
    // 待发货族：1/2/21/26（order_stats HAR）；补拉时 status:[] 不筛，再本地过滤虚拟已发货
    const PENDING_STATUS = [1, 2, 21, 26]
    const statusList = Array.isArray(opts.status)
      ? opts.status
      : opts.recover
        ? []
        : PENDING_STATUS

    const body = {
      page_no: Number(opts.pageNo) || 1,
      page_size: Number(opts.pageSize) || 50,
      order_tag_list: [],
      order_type_list: [],
      status: statusList,
      time_range_list: [{ time_type: 3, start_time: start, end_time: end }],
      seller_mark_priority_list: [],
      seller_mark_note_status_list: [],
      overdue_status: -2,
      sort_by: { sort_field: 'ordered_at', desc: true },
      need_declare_info: true,
      need_declare_times: true,
      allow_es_fallback: true
    }

    const path = '/api/edith/fulfillment/order/page'
    const hosts = []
    try {
      const host = location.hostname || ''
      // 当前页同域优先：ark 订单页有 _webmsxyw 签名（与 HAR 一致）
      if (host.includes('ark.xiaohongshu.com')) hosts.push('https://ark.xiaohongshu.com')
      if (host.includes('walle.xiaohongshu.com')) hosts.push('https://walle.xiaohongshu.com')
    } catch (e) {}
    hosts.push('https://ark.xiaohongshu.com', 'https://walle.xiaohongshu.com')
    const uniqHosts = hosts.filter(function (h, i) {
      return hosts.indexOf(h) === i
    })

    let data = null
    let lastErr = ''
    let usedHost = ''
    for (let hi = 0; hi < uniqHosts.length; hi++) {
      const base = uniqHosts[hi]
      const isArk = /ark\.xiaohongshu\.com/i.test(base)
      const headers = buildSignHeaders(path, { subsystem: isArk ? '' : 'eva' })
      try {
        const res = await fetch(base + path, {
          method: 'POST',
          credentials: 'include',
          headers: headers,
          body: JSON.stringify(body)
        })
        const json = await res.json()
        data = json
        usedHost = base
        if (json && (json.success === true || json.code === 0 || (json.data && Array.isArray(json.data.packages)))) {
          break
        }
        lastErr =
          'host=' +
          base +
          ' http=' +
          res.status +
          ' code=' +
          (json && json.code) +
          ' msg=' +
          (json && (json.msg || json.message))
      } catch (e) {
        lastErr = 'host=' + base + ' ' + String(e && e.message ? e.message : e)
      }
    }

    if (!data) {
      return { __error: lastErr || 'fulfillment/order/page 无响应', orders: [] }
    }
    if (data.success === false && data.code !== 0) {
      return {
        __error:
          'fulfillment/order/page 失败: code=' +
          data.code +
          ' msg=' +
          (data.msg || data.message || '') +
          ' host=' +
          usedHost,
        orders: []
      }
    }

    const packages =
      (data.data && (data.data.packages || data.data.orders || data.data.package_list || data.data.list)) ||
      []

    const orders = []
    for (const row of Array.isArray(packages) ? packages : []) {
      const orderSn =
        row.orderId ||
        row.order_id ||
        row.orderSn ||
        row.order_sn ||
        row.packageId ||
        row.package_id ||
        row.id ||
        ''
      // HAR：itemId 在 packages[].skus[0].itemId（商品级），skuId 是规格级勿当商品绑定键
      const sku = (row.skus && row.skus[0]) || null
      const productId =
        (sku && (sku.itemId || sku.item_id || sku.goodsId || sku.goods_id)) ||
        row.itemId ||
        row.item_id ||
        ''
      const statusText =
        row.statusDesc || row.status_desc || row.status_name || row.status || '待发货'
      const statusCode = Number(row.status)
      const tags = row.orderTagList || row.order_tag_list || []
      const isVirtual =
        (Array.isArray(tags) &&
          tags.some(function (t) {
            return /NO_LOGISTICS|AUTO_DELIVERY|ONLY_SUPPORT_NO_LOGISTICS/i.test(String(t))
          })) ||
        false

      const isPending = PENDING_STATUS.indexOf(statusCode) >= 0
      // 已发货未签收(6)/已完成类：仅 recover + 无物流/自动发货虚拟单才纳入（补发卡密）
      if (!isPending) {
        if (!(opts.recover && isVirtual && (statusCode === 6 || statusCode === 65 || statusCode === 7))) {
          continue
        }
      }

      const orderTime =
        row.paidAt ||
        row.paid_at ||
        row.orderedAt ||
        row.ordered_at ||
        row.createdAt ||
        row.created_at ||
        row.create_time ||
        row.createTime ||
        row.order_time ||
        row.orderTime ||
        row.pay_time ||
        row.payTime ||
        row.gmt_create ||
        row.gmtCreate ||
        ''
      if (orderSn) {
        orders.push({
          order_id: String(orderSn),
          product_id: String(productId || ''),
          status: String(statusText),
          status_code: Number.isFinite(statusCode) ? statusCode : null,
          order_time: String(orderTime || ''),
          is_virtual: isVirtual,
          source: 'fulfillment_api',
          host: usedHost
        })
      }
    }
    return orders
  }

  window.__xhsAssistant = window.__xhsAssistant || { version: '1.0.0' }
  window.__xhsAssistant.im = {
    getUserByOrderSn,
    getBuyerNameByOrderSn,
    getChatId,
    sendTextMsg,
    sendImageMsg,
    sendVideoMsg,
    sendNotesMsg,
    deliverByOrderSn,
    fetchPendingOrders,
    hasXhsRim: function () {
      return !!(window.XhsRim && typeof window.XhsRim.sendTextMsg === 'function')
    }
  }

  console.log('[XHS Assistant] IMSend 桥已注入, XhsRim=', !!(window.XhsRim && window.XhsRim.sendTextMsg))
})()
