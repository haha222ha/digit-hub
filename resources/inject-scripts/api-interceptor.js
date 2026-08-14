/**
 * API 拦截器 - 拦截小红书 API 请求
 * 对标原版请求拦截逻辑
 */
(function () {
  if (window.__xhsApiInterceptor) return;
  window.__xhsApiInterceptor = true;
  console.log('[XHS Assistant] API 拦截器已注入');

  // 清掉历史脏 token，避免 Eva 启动即用 undefined!! 请求 → 401 →「登录认证已过期」
  try {
    var bad = /^(undefined|null|nan)?$/i;
    ['auth-token', 'authToken', 'accessToken', 'access_token'].forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v != null && (bad.test(String(v).trim()) || String(v).trim().length < 16)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { }

  function isLoginPage() {
    try {
      return /\/login|cstools\/login|customer\.xiaohongshu\.com/.test(location.href);
    } catch (e) {
      return false;
    }
  }

  function scrapeAuth(data) {
    if (!data || typeof data !== 'object') return false;
    function ok(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s || s.length < 16) return false;
      if (/^(undefined|null|nan)$/i.test(s)) return false;
      if (/^a1:/i.test(s)) return false;
      return true;
    }
    try {
      const payload = data.data && typeof data.data === 'object' ? data.data : data;
      const authToken = payload.authToken || payload.auth_token || payload['auth-token'] || '';
      const accessToken = payload.accessToken || payload.access_token || payload['access-token'] || '';
      const bUserId = payload.bUserId || payload.b_user_id || payload.userId || payload.sellerId || '';
      if (!ok(authToken) || !ok(accessToken)) return false;
      // 禁止写 not_found 哨兵
      if (/not[_-]?found/i.test(String(authToken)) || /not[_-]?found/i.test(String(accessToken))) return false;
      localStorage.setItem('auth-token', String(authToken));
      localStorage.setItem('accessToken', String(accessToken));
      if (bUserId) localStorage.setItem('bUserId', String(bUserId));
      document.cookie = 'walle-eva-auth=' + encodeURIComponent(authToken + '!!' + accessToken) + '; path=/; Secure; SameSite=None';
      return true;
    } catch (e) { }
    return false;
  }

  const LOGIN_API = /get_login_user|login_user|mcs\/user|switch_eva_login_user|ServiceTicket|service_ticket|password_login|email_login|sms_login|\/cas\/|eva\/login|account\/login|auth\/token|get_token/i;

  // ===== 拦截 fetch 请求 =====
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    console.log('[XHS Assistant] 拦截 fetch:', url);

    return originalFetch.apply(this, args).then(response => {
      // 克隆响应以便读取
      const clone = response.clone();
      clone.json().then(data => {
        // 禁止对每个 401 发重定向：次要接口 401 很常见，会冲掉会话列表
        // 真正过期由页面自己的登录态 / kefu-cookie-expired 处理
        if (response.status === 401 && !isLoginPage()) {
          const u = String(url || '')
          const critical = /\/logout|\/cas\/|password_login|email_login/i.test(u)
          if (critical) {
            console.warn('[XHS Assistant] 关键鉴权 401:', u)
            window.postMessage({ type: 'xhs-401-redirect', url: url }, '*');
          } else {
            console.warn('[XHS Assistant] 忽略非关键 401:', u.slice(0, 120));
          }
        }

        // ServiceTicket / get_csa_info（对标 HandleServiceTicketResponseAsync）
        if (url && String(url).includes('get_csa_info')) {
          const success = data && (data.success === true || (data.code === 0 && data.data));
          window.postMessage({
            type: 'xhs-csa-info',
            url: url,
            success: !!success,
            data: data
          }, '*');
          // 登录过程中 get_csa 失败是常态，禁止当 Cookie 过期
        }

        scrapeAuth(data);

        // 登录用户信息 + 同步 token 到 localStorage（供主进程写 walle-eva-auth）
        if (url && LOGIN_API.test(String(url))) {
          window.postMessage({
            type: 'xhs-login-user',
            url: url,
            data: data
          }, '*');
        }

        // 订单列表（待发货）→ 推给自动发货
        if (url && /fulfillment\/order\/page|order\/page/i.test(String(url))) {
          try {
            const rows =
              (data && data.data && (data.data.orders || data.data.package_list || data.data.list || data.data.packages)) ||
              [];
            if (Array.isArray(rows)) {
              rows.forEach(function (row) {
                const orderSn = row.order_id || row.orderSn || row.order_sn || row.id || '';
                const pkgs = row.packages || [row];
                const sku = (pkgs[0] && pkgs[0].skus && pkgs[0].skus[0]) || (row.skus && row.skus[0]) || null;
                const productId = (sku && (sku.itemId || sku.item_id || sku.sku_id)) || row.item_id || '';
                const statusText = row.status_desc || row.status_name || row.status || '待发货';
                const orderTime =
                  row.created_at || row.create_time || row.createTime ||
                  row.order_time || row.orderTime || row.paid_time || row.pay_time ||
                  row.payTime || row.gmt_create || row.gmtCreate || '';
                if (orderSn) {
                  window.postMessage({
                    type: 'xhs-new-order',
                    orderId: String(orderSn),
                    productId: String(productId || ''),
                    status: String(statusText),
                    orderTime: String(orderTime || ''),
                    source: 'api_intercept'
                  }, '*');
                }
              });
            }
          } catch (e) { }
        }

        // 通知主进程
        window.postMessage({
          type: 'xhs-api-response',
          url: url,
          status: response.status,
          data: data
        }, '*');
      }).catch(() => { });

      return response;
    });
  };

  // ===== 拦截 XMLHttpRequest =====
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__xhsUrl = url;
    this.__xhsMethod = method;
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', function () {
      console.log('[XHS Assistant] XHR 完成:', this.__xhsUrl, this.status);

      if (this.status === 401 && !isLoginPage()) {
        const u = String(this.__xhsUrl || '');
        const critical = /\/logout|\/cas\/|password_login|email_login/i.test(u);
        if (critical) {
          console.warn('[XHS Assistant] XHR 关键鉴权 401:', u);
          window.postMessage({ type: 'xhs-401-redirect', url: this.__xhsUrl }, '*');
        }
      }

      // 尝试解析响应
      try {
        const data = JSON.parse(this.responseText);
        const reqUrl = String(this.__xhsUrl || '');

        if (reqUrl.includes('get_csa_info')) {
          const success = data && (data.success === true || (data.code === 0 && data.data));
          window.postMessage({
            type: 'xhs-csa-info',
            url: reqUrl,
            success: !!success,
            data: data
          }, '*');
        }

        scrapeAuth(data);

        // XHR 路径同样同步 login token（不少登录接口走 XHR）
        if (LOGIN_API.test(reqUrl)) {
          window.postMessage({
            type: 'xhs-login-user',
            url: reqUrl,
            data: data
          }, '*');
        }

        window.postMessage({
          type: 'xhs-api-response',
          url: this.__xhsUrl,
          status: this.status,
          data: data
        }, '*');
      } catch (e) {
        // 非 JSON 响应
      }
    });

    return originalSend.call(this, body);
  };

  // ===== 拦截 axios（如果存在）=====
  if (window.axios) {
    window.axios.interceptors.response.use(
      response => {
        console.log('[XHS Assistant] axios 响应:', response.config.url);
        return response;
      },
      error => {
        if (error.response && error.response.status === 401 && !isLoginPage()) {
          const u = String((error.config && error.config.url) || '');
          if (/\/logout|\/cas\/|password_login|email_login/i.test(u)) {
            window.postMessage({ type: 'xhs-401-redirect', url: error.config.url }, '*');
          }
        }
        return Promise.reject(error);
      }
    );
  }
})();