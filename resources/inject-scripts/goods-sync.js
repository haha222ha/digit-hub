/**
 * 商品同步 — 对标 ProductAnalyzer 本店商品库「已上架」
 * 主路径：POST /api/edith/product/search_item_v2（card_type=2）
 * 回落：GET /api/edith/goods-note/list（旧笔记商品）
 * 必须在 ark 域（含 accessToken + cookie）执行
 */
(function () {
  if (window.__xhsAssistantGoodsSync) return
  window.__xhsAssistantGoodsSync = true
  console.log('[XHS Assistant] 商品同步脚本已注入（search_item_v2）')

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

  function authHeaders(apiPath) {
    const token = getAccessToken()
    const sign = buildSign(apiPath)
    const h = {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json;charset=UTF-8',
      'x-subsystem': 'ark'
    }
    if (token) h.authorization = token
    return Object.assign(h, sign)
  }

  function priceToYuan(n) {
    const v = Number(n)
    if (!Number.isFinite(v) || v <= 0) return ''
    if (!Number.isInteger(v)) return String(v)
    if (v >= 50) return String(Math.round(v) / 100)
    return String(v)
  }

  function pickImage(raw) {
    if (!raw || typeof raw !== 'object') return ''
    const direct = [
      raw.image_url,
      raw.imageUrl,
      raw.cover,
      raw.coverUrl,
      raw.image,
      raw.item_image,
      raw.itemImage
    ]
    for (const v of direct) {
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v.trim()
    }
    const imgs = raw.images || raw.image_list || raw.imageList
    if (Array.isArray(imgs) && imgs[0]) {
      const first = imgs[0]
      if (typeof first === 'string') return first
      if (first && first.url) return String(first.url)
    }
    return ''
  }

  function mapShelfItem(raw) {
    const itemId = String(raw.item_id || raw.itemId || raw.id || '').trim()
    if (!itemId || itemId.length < 8) return null
    if (raw.buyable === false || raw.buyable === 0) return null
    const ss = raw.shelf_status != null ? raw.shelf_status : raw.shelfStatus
    if (ss != null && ss !== '' && Number(ss) !== 1) return null
    const title = String(
      raw.item_name ||
        raw.itemName ||
        raw.item_name_with_brand_name ||
        raw.title ||
        raw.name ||
        itemId
    ).trim()
    const price = priceToYuan(raw.min_price != null ? raw.min_price : raw.minPrice || raw.price)
    const sku =
      raw.first_buyable_sku_id ||
      raw.firstBuyableSkuId ||
      raw.sku_id ||
      raw.skuId ||
      ''
    return {
      itemId,
      title: title || itemId,
      noteId: '',
      price: price || '',
      stock: String(raw.stock != null ? raw.stock : raw.inventory || ''),
      image: pickImage(raw),
      variant: sku ? String(sku) : '',
      buyable: raw.buyable,
      source: 'search_item_v2'
    }
  }

  /**
   * 已上架商品（对标 PA 本店商品库 /list/shelf，card_type=2）
   */
  async function fetchShelfGoodsList() {
    const pageSize = 100
    let page = 1
    const all = []
    const seen = new Set()
    let total = 0
    const apiPath = '/api/edith/product/search_item_v2'

    while (page <= 50) {
      const body = {
        page_no: page,
        pageNo: page,
        page_size: pageSize,
        pageSize: pageSize,
        buyable: true,
        shelf_status: 1,
        shelfStatus: 1,
        search_filter: {
          card_type: 2,
          is_channel: false
        },
        search_order: { sort_field: 'create_time', order: 'desc' },
        search_item_detail_option: {
          with_product_quality_score: false,
          with_hot_item_award_text_info: false,
          with_ai_publish_note_permission: false,
          with_inventory_risk_info: true,
          with_item_lock_info: true
        }
      }

      const response = await fetch('https://ark.xiaohongshu.com' + apiPath, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(apiPath),
        body: JSON.stringify(body)
      })
      const result = await response.json().catch(() => null)
      if (!result || result.success !== true) {
        const msg =
          (result && (result.msg || result.message)) ||
          'search_item_v2 返回异常: ' + JSON.stringify(result || {}).slice(0, 200)
        throw new Error(msg)
      }

      const data = result.data || {}
      const items = Array.isArray(data.items) ? data.items : []
      const t = Number(data.total)
      if (Number.isFinite(t) && t > 0) total = t

      for (const raw of items) {
        const mapped = mapShelfItem(raw)
        if (!mapped || seen.has(mapped.itemId)) continue
        seen.add(mapped.itemId)
        all.push(mapped)
      }

      if (items.length === 0) break
      if (total > 0 && all.length >= total) break
      if (items.length < pageSize) break
      page++
      await new Promise((r) => setTimeout(r, 280))
    }

    return all
  }

  function pickItemId(note, goods) {
    const g = goods || {}
    return String(
      g.item_id || g.itemId || g.goods_id || note.item_id || note.itemId || note.goods_id || ''
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

  /** 旧接口回落：笔记关联商品 */
  async function fetchGoodsNoteList() {
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
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: authHeaders(apiUrl)
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
              variant: g.variant_desc || g.variantDesc || '',
              source: 'goods_note'
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
            variant: '',
            source: 'goods_note'
          })
        }
      }

      if (allGoods.length >= total || list.length === 0) break
      pageNo++
      if (pageNo > 200) break
    }

    return allGoods
  }

  /**
   * 优先已上架 search_item_v2；失败再回落笔记商品
   */
  async function fetchGoodsList() {
    const token = getAccessToken()
    if (!token) {
      throw new Error('千帆商家后台未登录：缺少 accessToken，请先登录 ark 后台后再同步')
    }
    try {
      const shelf = await fetchShelfGoodsList()
      if (shelf.length > 0) return shelf
      console.warn('[GoodsSync] search_item_v2 返回空，尝试 goods-note 回落')
    } catch (e) {
      console.warn('[GoodsSync] search_item_v2 失败，回落 goods-note:', e && e.message)
    }
    return fetchGoodsNoteList()
  }

  function isReady() {
    return !!getAccessToken()
  }

  if (!window.__xhsAssistant) window.__xhsAssistant = {}
  window.__xhsAssistant.goods = {
    fetchGoodsList,
    fetchShelfGoodsList,
    fetchGoodsNoteList,
    isReady,
    getAccessToken: () => !!getAccessToken()
  }
})()
