/**
 * 虚拟发货 IM 桥 — 对标阿奇锁 IMSend.js
 * 依赖页面已加载 window.XhsRim（客服工作台 /cstools/chat）
 *
 * 暴露：window.__xhsAssistant.im
 */
(function () {
  if (window.__xhsImSendReady) return
  window.__xhsImSendReady = true

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

  function buildSignHeaders(apiPath) {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'x-subsystem': 'eva'
    }
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
    const headers = buildSignHeaders(path)
    const res = await fetch('https://walle.xiaohongshu.com' + path, {
      method: 'GET',
      credentials: 'include',
      headers
    })
    return res.json()
  }

  async function apiPost(path, body) {
    const headers = buildSignHeaders(path)
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
   * 拉取待发货订单（对标 fulfillment/order/page）
   * 优先 ark，失败回退 walle
   */
  async function fetchPendingOrders() {
    const body = {
      page_no: 1,
      page_size: 20,
      status: 2,
      multi_search_field: ''
    }
    const path = '/api/edith/fulfillment/order/page'
    const headers = buildSignHeaders(path)
    let data = null
    try {
      const res = await fetch('https://ark.xiaohongshu.com' + path, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body)
      })
      data = await res.json()
    } catch (e) {
      const res2 = await fetch('https://walle.xiaohongshu.com' + path, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body)
      })
      data = await res2.json()
    }

    const packages =
      data?.data?.orders ||
      data?.data?.package_list ||
      data?.data?.list ||
      data?.data?.packages ||
      []
    const orders = []
    for (const row of Array.isArray(packages) ? packages : []) {
      const orderSn = row.order_id || row.orderSn || row.order_sn || row.id || ''
      const pkgs = row.packages || [row]
      const sku =
        (pkgs[0] && pkgs[0].skus && pkgs[0].skus[0]) ||
        (row.skus && row.skus[0]) ||
        null
      const productId = sku?.itemId || sku?.item_id || sku?.sku_id || row.item_id || ''
      const statusText = row.status_desc || row.status_name || row.status || '待发货'
      // 下单/支付时间（用于「只处理绑定时间之后的订单」过滤）
      const orderTime =
        row.created_at || row.create_time || row.createTime ||
        row.order_time || row.orderTime || row.paid_time || row.pay_time ||
        row.payTime || row.gmt_create || row.gmtCreate || ''
      if (orderSn) {
        orders.push({
          order_id: String(orderSn),
          product_id: String(productId || ''),
          status: String(statusText),
          order_time: String(orderTime || ''),
          source: 'fulfillment_api'
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
