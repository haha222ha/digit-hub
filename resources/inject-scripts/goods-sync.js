/**
 * 商品同步脚本 - 同步千帆后台商品列表（对标阿奇锁 getGoodsNoteList）
 * 接口：/api/edith/goods-note/list（ark.xiaohongshu.com）
 * 返回：note_infos[]，每个商品含 itemId（= 商品ID）、title（商品名）
 */
(function () {
  if (window.__xhsAssistantGoodsSync) return
  window.__xhsAssistantGoodsSync = true
  console.log('[XHS Assistant] 商品同步脚本已注入')

  /**
   * 同步商品列表（分页拉全量）
   * @returns {Promise<Array<{itemId, title, skuId, ...}>>}
   */
  async function fetchGoodsList() {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      throw new Error('未登录：缺少 accessToken，请先登录千帆客服')
    }

    const pageSize = 50
    let pageNo = 1
    const allGoods = []

    while (true) {
      const apiUrl = `/api/edith/goods-note/list?page_num=${pageNo}&page_size=${pageSize}`
      const url = 'https://ark.xiaohongshu.com' + apiUrl

      const sign = window._webmsxyw ? window._webmsxyw(apiUrl) : {}
      const response = await fetch(url, {
        method: 'GET',
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
        // 提取商品 ID：优先 itemId，其次 sku.itemId
        const firstSku = (note.skus && note.skus[0]) || (note.sku_list && note.sku_list[0]) || null
        const itemId =
          note.itemId || note.item_id || note.goods_id ||
          (firstSku && (firstSku.itemId || firstSku.item_id)) ||
          note.id || ''
        allGoods.push({
          itemId: String(itemId),
          title: note.title || note.name || note.goods_name || '',
          noteId: note.note_id || note.id || '',
          price: note.price || firstSku?.price || '',
          stock: note.stock || firstSku?.stock || '',
          image: note.image || note.cover || ''
        })
      }

      if (allGoods.length >= total || list.length === 0) {
        break
      }
      pageNo++
    }

    return allGoods
  }

  // 暴露到全局，供主进程通过 executeJavaScript 调用
  if (!window.__xhsAssistant) window.__xhsAssistant = {}
  window.__xhsAssistant.goods = {
    fetchGoodsList
  }
})()
