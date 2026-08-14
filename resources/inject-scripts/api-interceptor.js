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

  // ===== get_csa_info 成功 → 提取 csProviderId 写入 imStore（加速 XhsRim 就绪） =====
  function extractCsProviderId(data) {
    if (!data || typeof data !== 'object') return '';
    function pick(v) {
      var s = String(v == null ? '' : v).trim();
      return s && s.length > 0 && s.length < 64 ? s : '';
    }
    var d = (data.data && typeof data.data === 'object') ? data.data : data;
    var direct = [
      d.csProviderId, d.cs_provider_id, d.providerId, d.provider_id,
      d.user && d.user.csProviderId, d.user && d.user.cs_provider_id,
      d.csaInfo && d.csaInfo.csProviderId, d.csa_info && d.csa_info.csProviderId,
      d.seller && d.seller.csProviderId
    ];
    for (var i = 0; i < direct.length; i++) {
      var s = pick(direct[i]);
      if (s) return s;
    }
    // 兜底：浅扫一层对象，找 csProviderId / cs_provider_id
    try {
      var ks = Object.keys(d);
      for (var j = 0; j < ks.length; j++) {
        var val = d[ks[j]];
        if (val && typeof val === 'object') {
          var s2 = pick(val.csProviderId || val.cs_provider_id);
          if (s2) return s2;
        }
      }
    } catch (e) { }
    return '';
  }

  function patchImStoreCsProviderId(csProviderId) {
    if (!csProviderId) return false;
    try {
      var app = document.querySelector('#app');
      var store = app && app.__vue_app__ && app.__vue_app__._context &&
        app.__vue_app__._context.provides && app.__vue_app__._context.provides.store;
      if (!store || !store.state || !store.state.imStore) return false;
      var imStore = store.state.imStore;
      var next = Object.assign({}, imStore.xUserInfo || {}, { csProviderId: String(csProviderId) });
      // 优先 patch 已有 xUserInfo
      if (imStore.xUserInfo && typeof imStore.xUserInfo === 'object') {
        try { imStore.xUserInfo.csProviderId = String(csProviderId); return true; } catch (e) { }
      }
      // 尝试 commit（不同版本 action 名可能不同）
      if (typeof store.commit === 'function') {
        try { store.commit('setXUserInfo', next); return true; } catch (e) { }
        try { store.commit('SET_X_USER_INFO', next); return true; } catch (e) { }
      }
      // 兜底：直接挂到 imStore.xUserInfo
      try { imStore.xUserInfo = next; return true; } catch (e) { }
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
          const csProviderId = success ? extractCsProviderId(data) : '';
          window.postMessage({
            type: 'xhs-csa-info',
            url: url,
            success: !!success,
            csProviderId: csProviderId,
            data: data
          }, '*');
          // 登录成功后把 csProviderId 直接 patch 进 imStore，加速 XhsRim 就绪
          if (success && csProviderId) {
            patchImStoreCsProviderId(csProviderId);
            window.ImLoginInfo = Object.assign({}, window.ImLoginInfo || {}, { csProviderId: csProviderId });
          }
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

        // 订单列表 → 推给自动发货（字段对齐千帆 packages：orderId / itemId / statusDesc / paidAt）
        if (url && /fulfillment\/order\/page|order\/page/i.test(String(url))) {
          try {
            const rows =
              (data && data.data && (data.data.packages || data.data.orders || data.data.package_list || data.data.list)) ||
              [];
            if (Array.isArray(rows)) {
              rows.forEach(function (row) {
                const orderSn =
                  row.orderId || row.order_id || row.orderSn || row.order_sn || row.packageId || row.id || '';
                const pkgs = row.packages || [row];
                const sku = (pkgs[0] && pkgs[0].skus && pkgs[0].skus[0]) || (row.skus && row.skus[0]) || null;
                const productId =
                  (sku && (sku.itemId || sku.item_id || sku.goodsId)) ||
                  row.itemId ||
                  row.item_id ||
                  '';
                const statusText = row.statusDesc || row.status_desc || row.status_name || row.status || '待发货';
                const orderTime =
                  row.paidAt || row.paid_at || row.orderedAt || row.ordered_at ||
                  row.createdAt || row.created_at || row.create_time || row.createTime ||
                  row.order_time || row.orderTime || row.pay_time || row.payTime ||
                  row.gmt_create || row.gmtCreate || '';
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
          const csProviderId = success ? extractCsProviderId(data) : '';
          window.postMessage({
            type: 'xhs-csa-info',
            url: reqUrl,
            success: !!success,
            csProviderId: csProviderId,
            data: data
          }, '*');
          if (success && csProviderId) {
            patchImStoreCsProviderId(csProviderId);
            window.ImLoginInfo = Object.assign({}, window.ImLoginInfo || {}, { csProviderId: csProviderId });
          }
        }

        scrapeAuth(data);

        // 登录用户信息 + 同步 token 到 localStorage（供主进程写 walle-eva-auth）
        if (LOGIN_API.test(reqUrl)) {
          window.postMessage({
            type: 'xhs-login-user',
            url: reqUrl,
            data: data
          }, '*');
        }

        // XHR 路径同样推送订单（部分页面走 XHR 而非 fetch）
        if (/fulfillment\/order\/page|order\/page/i.test(reqUrl)) {
          try {
            const rows =
              (data && data.data && (data.data.packages || data.data.orders || data.data.package_list || data.data.list)) ||
              [];
            if (Array.isArray(rows)) {
              rows.forEach(function (row) {
                const orderSn =
                  row.orderId || row.order_id || row.orderSn || row.order_sn || row.packageId || row.id || '';
                const sku = (row.skus && row.skus[0]) || null;
                const productId =
                  (sku && (sku.itemId || sku.item_id || sku.goodsId)) ||
                  row.itemId ||
                  row.item_id ||
                  '';
                const statusText = row.statusDesc || row.status_desc || row.status_name || row.status || '待发货';
                const orderTime =
                  row.paidAt || row.paid_at || row.orderedAt || row.ordered_at ||
                  row.createdAt || row.created_at || row.create_time || row.createTime ||
                  row.order_time || row.orderTime || row.pay_time || row.payTime ||
                  row.gmt_create || row.gmtCreate || '';
                if (orderSn) {
                  window.postMessage({
                    type: 'xhs-new-order',
                    orderId: String(orderSn),
                    productId: String(productId || ''),
                    status: String(statusText),
                    orderTime: String(orderTime || ''),
                    source: 'api_intercept_xhr'
                  }, '*');
                }
              });
            }
          } catch (e) { }
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