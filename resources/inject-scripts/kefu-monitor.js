/**
 * 客服消息监控脚本 - 监听客服聊天消息并触发自动回复
 * 对标原版 KefuAutoLogin + AutoReplyConfig
 */
(function () {
  console.log('[XHS Assistant] 客服监控脚本已注入');

  // 监听新消息
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'kefu-new-message') {
      console.log('[XHS Assistant] 收到客服消息:', event.data.content);
      handleNewMessage(event.data.content, event.data.sender);
    }
  });

  // DOM 变化监听（检测新消息）
  const observer = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // 检测消息元素
          const messageEl = node.querySelector('.message-content, .chat-message, [class*="message-text"]') || node;
          if (messageEl && messageEl.textContent) {
            const content = messageEl.textContent.trim();
            if (content && content.length > 0 && content.length < 500) {
              // 判断是否是收到的消息（非自己发送的）
              const isReceived = node.classList.contains('received') ||
                node.querySelector('.received, .incoming, [class*="other"]');

              if (isReceived) {
                handleNewMessage(content, 'customer');
              }
            }
          }
        }
      }
    }
  });

  // 开始观察
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Cookie 过期检测：仅当确实回到登录页，禁止用 [class*=login] 误杀工作台
  setInterval(function () {
    if (!/\/login|cstools\/login/.test(location.href)) return;
    console.warn('[XHS Assistant] 当前已在登录页，Cookie 可能已过期');
    window.postMessage({
      type: 'kefu-cookie-expired',
      timestamp: Date.now()
    }, '*');
  }, 30000);

  function handleNewMessage(content, sender) {
    console.log('[XHS Assistant] 处理客服消息:', content, 'from:', sender);

    // 通知主进程
    window.postMessage({
      type: 'xhs-kefu-message',
      content: content,
      sender: sender,
      timestamp: Date.now()
    }, '*');

    // 调用本地 API 查询匹配的回复规则
    if (window.__xhsAssistant) {
      fetch(`${window.__xhsAssistant.apiEndpoint}/api/reply/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content,
          shopId: (window.__xhsAssistant && window.__xhsAssistant.shopId) || '',
          timestamp: Date.now()
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.reply) {
            console.log('[XHS Assistant] 匹配到回复规则:', data.reply);
            // 执行自动回复
            autoReply(data.reply);
          }
        })
        .catch(e => console.error('[XHS Assistant] 回复规则查询失败:', e));
    }
  }

  function autoReply(reply) {
    // 查找输入框
    const inputEl = document.querySelector('.chat-input, textarea, [contenteditable="true"]');
    if (inputEl) {
      console.log('[XHS Assistant] 执行自动回复:', reply);

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        // 使用原生 setter 设置值
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(inputEl, reply);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 模拟回车发送
        setTimeout(() => {
          inputEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }));
        }, 100);
      } else {
        // contenteditable
        inputEl.textContent = reply;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }
})();