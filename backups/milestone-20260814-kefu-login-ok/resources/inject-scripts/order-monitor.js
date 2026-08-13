/**
 * 订单监控脚本 - 监听新订单并触发自动发货
 * 对标原版 AutoShipConfig
 */
(function () {
  console.log('[XHS Assistant] 订单监控脚本已注入');

  // 监听新订单消息
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'new-order') {
      console.log('[XHS Assistant] 收到新订单:', event.data.order);
      handleNewOrder(event.data.order);
    }
  });

  // 定时检查订单列表（DOM 轮询）
  let lastOrderCount = 0;
  setInterval(function () {
    try {
      const orderElements = document.querySelectorAll('.order-item, .order-card, [class*="order"]');
      if (orderElements.length > 0 && orderElements.length !== lastOrderCount) {
        console.log('[XHS Assistant] 订单数量变化:', lastOrderCount, '->', orderElements.length);

        if (orderElements.length > lastOrderCount) {
          // 新订单出现
          const newOrders = Array.from(orderElements).slice(lastOrderCount);
          newOrders.forEach(order => {
            const orderText = order.textContent || '';
            const orderId = extractOrderId(orderText);
            if (orderId) {
              handleNewOrder({ id: orderId, element: order });
            }
          });
        }

        lastOrderCount = orderElements.length;
      }
    } catch (e) {
      // 忽略 DOM 查询错误
    }
  }, 5000); // 5 秒检查一次

  function extractOrderId(text) {
    const match = text.match(/订单号[：:]\s*(\d+)/);
    return match ? match[1] : null;
  }

  function handleNewOrder(order) {
    console.log('[XHS Assistant] 处理新订单:', order.id || order);

    // 通知主进程处理发货
    window.postMessage({
      type: 'xhs-new-order',
      orderId: order.id,
      timestamp: Date.now()
    }, '*');

    // 调用本地 API 触发自动发货
    if (window.__xhsAssistant) {
      fetch(`${window.__xhsAssistant.apiEndpoint}/api/shipping/auto-ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          timestamp: Date.now()
        })
      }).catch(e => console.error('[XHS Assistant] 自动发货请求失败:', e));
    }
  }
})();