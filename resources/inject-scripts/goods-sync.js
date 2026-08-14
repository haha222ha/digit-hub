/**
 * 商品同步脚本 — 对标阿奇锁 getGoodsNoteList
 * 接口：GET https://ark.xiaohongshu.com/api/edith/goods-note/list
 * 必须在 ark 域（含 accessToken + _webmsxyw）执行
 */
(function () {
  if (window.__xhsAssistantGoodsSync) return
  window.__xhsAssistantGoodsSync = true
  console.log('[XHS Assistant] 商品同步脚本已注入')

  function getAccessToken() {
    try {
      return (
        localStorage.getItem('accessToken') ||
        localStorage.getItem('access_token') ||
        localStorage.getItem('Authorization') ||
        ''
      )
    } catch {
      return ''
    }
  }

  function buildSign(apiPath) {
    try {
      if (typeof window._webmsxyw === 'function') {
        const sign = window._webmsxyw(apiPath)
        if (sign && typeof sign === 'object') return sign
        if (typeof sign === 'string' && sign) return { 'X-s': sign }
      }
    } catch (e) {
      console.warn('[GoodsSync] _webmsxyw 签名失败', e)
    }
    return {}
  }

  function pickItemId(note, goods) {
    const g = goods || {}
    return String(
      g.item_id ||
        g.itemId ||
        g.goods_id ||
        note.item_id ||
        note.itemId ||
        note.goods_id ||
        ''
    )
  }

  function pickTitle(note, goods) {
    const g = goods || {}
    return (
      g.item_title ||
      g.itemTitle ||
      g.title ||
      note.note_title ||
      note.noteTitle ||
      note.title ||
      note.name ||
      ''
    )
  }

  /**
   * 分页拉全量商品（按 itemId 去重）
   * @returns {Promise<Array<{itemId, title, noteId, price, stock, image, variant}>>}
   */
  async function fetchGoodsList() {
    const token = getAccessToken()
    if (!token) {
      throw new Error('千帆商家后台未登录：缺少 accessToken，请先登录 ark 后台后再同步')
    }

    const pageSize = 50
    let pageNo = 1
    const allGoods = []
    const seen = new Set()

    while (true) {
      const apiUrl = `/api/edith/goods-note/list?page_num=${pageNo}&page_size=${pageSize}`
      const url = 'https://ark.xiaohongshu.com' + apiUrl
      const sign = buildSign(apiUrl)

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json;charset=UTF-8',
          'x-subsystem': 'eva',
          authorization: token,
          ...sign
        }
      })
      const result = await response.json()
      if (!result || result.success !== true) {
        throw new Error('商品列表接口返回异常: ' + JSON.stringify(result || {}))
      }

      const list = (result.data && result.data.note_infos) || []
      const total = (result.data && result.data.total) || 0

      for (const note of list) {
        const goodsInfos = note.goods_infos || note.goodsInfos || []
        const noteId = note.note_id || note.noteId || note.id || ''
        if (Array.isArray(goodsInfos) && goodsInfos.length > 0) {
          for (const g of goodsInfos) {
            const itemId = pickItemId(note, g)
            if (!itemId || seen.has(itemId)) continue
            seen.add(itemId)
            allGoods.push({
              itemId,
              title: pickTitle(note, g),
              noteId: String(noteId),
              price: g.price || note.price || '',
              stock: g.stock || note.stock || '',
              image: g.item_image || g.itemImage || g.image || note.image || '',
              variant: g.variant_desc || g.variantDesc || ''
            })
          }
        } else {
          const firstSku = (note.skus && note.skus[0]) || (note.sku_list && note.sku_list[0]) || null
          const itemId = pickItemId(note, firstSku)
          if (!itemId || seen.has(itemId)) continue
          seen.add(itemId)
          allGoods.push({
            itemId,
            title: pickTitle(note, firstSku),
            noteId: String(noteId),
            price: note.price || (firstSku && firstSku.price) || '',
            stock: note.stock || (firstSku && firstSku.stock) || '',
            image: note.image || note.cover || '',
            variant: ''
          })
        }
      }

      if (allGoods.length >= total || list.length === 0) break
      pageNo++
      if (pageNo > 200) break
    }

    return allGoods
  }

  /** 页面是否具备同步条件（供主进程轮询） */
  function isReady() {
    // 有 token 即可先尝试；签名脚本可能稍晚加载
    return !!getAccessToken()
  }

  if (!window.__xhsAssistant) window.__xhsAssistant = {}
  window.__xhsAssistant.goods = {
    fetchGoodsList,
    isReady,
    getAccessToken: () => !!getAccessToken()
  }
})()
