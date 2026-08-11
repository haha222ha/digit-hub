/**
 * 会员中心共享 API 工具 — ES5 兼容
 */
(function (global) {
  'use strict';

  var STORAGE = { token: 'xhs_member_token' };

  function loadStored(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function esc(s) {
    if (s === null || s === undefined) s = '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getToken() {
    return loadStored(STORAGE.token);
  }

  function formatApiError(data, statusText, status) {
    if (!data) data = {};
    if (typeof data.detail === 'string') return data.detail;
    if (data.detail && typeof data.detail === 'object' && data.detail.detail) return data.detail.detail;
    if (data.detail && typeof data.detail === 'object' && data.detail.migration_url) return data.detail.detail || '功能已迁移';
    if (Array.isArray(data.detail)) {
      return data.detail.map(function (e) { return e.msg || JSON.stringify(e); }).join('；');
    }
    if (data.message) return data.message;
    return statusText || ('请求失败 (HTTP ' + (status || '') + ')');
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    var k;
    for (k in (opts.headers || {})) {
      if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];
    }
    if (opts.auth) {
      var t = getToken();
      if (t) headers.Authorization = 'Bearer ' + t;
    }
    return fetch(path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: headers,
      body: opts.body
    }).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (e) {}
        }
        if (!r.ok) {
          var err = new Error(formatApiError(data, r.statusText, r.status));
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  global.MemberCore = {
    STORAGE: STORAGE,
    loadStored: loadStored,
    esc: esc,
    getToken: getToken,
    api: api
  };
  if (!global.api) global.api = api;
  if (!global.esc) global.esc = esc;
})(typeof window !== 'undefined' ? window : this);
