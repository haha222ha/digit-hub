/**
 * 主钩子脚本 - 注入到所有页面
 * 对标原版 XhsJsFilter
 */
console.log('[XHS Assistant] 主钩子脚本已注入 v1.0.0');

// 全局命名空间
window.__xhsAssistant = {
  version: '1.0.0',
  injectTime: new Date().toISOString(),
  apiEndpoint: 'http://127.0.0.1:19527'
};

// 通知主进程页面已加载
window.postMessage({
  type: 'xhs-page-loaded',
  url: window.location.href,
  time: Date.now()
}, '*');