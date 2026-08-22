/**
 * digit-hub ↔ xlxtest L3 镜像桥接
 * 在 /xlx-mirror/past?token=...&psy_integrated=1 下加载（由 mirror-bootstrap 注入）
 *
 * - 校验分销 token（/api/links/validate 或 unlimited）
 * - 写入 xlxtest_authcode_* 供原站 Vue 跳过授权码
 * - /api/verify → start-test + 返回 verifyToken
 * - localStorage 历史写入 → complete-test
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var distToken = params.get('token') || '';
  var testCode = params.get('test_code') || 'past_xlx';
  var scaleCode = params.get('scale') || 'past';
  var unlimited = params.get('unlimited') === 'true';
  var origin = location.origin;

  if (!distToken) {
    console.error('[xlx-digit] missing token');
    return;
  }

  var state = {
    validated: false,
    started: false,
    completed: false,
    linkCode: '',
  };

  function b64urlJson(obj) {
    var json = JSON.stringify(obj);
    var b64 = btoa(
      encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
    );
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deviceId() {
    var key = 'xlx_digit_device_id';
    try {
      var id = localStorage.getItem(key);
      if (id && id.length >= 16) return id;
      id =
        'psy_' +
        Array.from({ length: 20 }, function () {
          return Math.floor(Math.random() * 36).toString(36);
        }).join('');
      localStorage.setItem(key, id);
      return id;
    } catch (e) {
      return 'psy_mirror_device_001';
    }
  }

  function makeVerifyToken(linkCode) {
    var payload = {
      code: linkCode,
      deviceId: deviceId(),
      scaleCode: scaleCode,
      scaleId: 1,
      exp: Date.now() + 7 * 86400000,
    };
    var sig = Array.from({ length: 32 }, function () {
      return 'ABCDEFGHJKMNPQRSTUYZ23456789'[Math.floor(Math.random() * 32)];
    }).join('');
    return b64urlJson(payload) + '.' + sig;
  }

  function linkCodeFromToken(token) {
    var slug = String(token || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 22);
    if (slug.length < 6) slug = 'psylink' + slug;
    return 'link:' + slug;
  }

  function seedXlxAuth(verifyToken) {
    var code = state.linkCode || linkCodeFromToken(distToken);
    var authPayload = {
      code: code.replace(/^link:/, '').toUpperCase().slice(0, 12) || 'DIST',
      questionnaireKey: scaleCode,
      scaleCode: scaleCode,
      verifyToken: verifyToken,
      activatedAt: Date.now(),
      reportTemplate: 'default',
      deviceFingerprint: deviceId(),
    };
    try {
      localStorage.setItem('xlxtest_authcode_' + scaleCode, JSON.stringify(authPayload));
    } catch (e) {}
  }

  function apiPost(path, body) {
    return fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function validateDistToken() {
    return apiPost('/api/links/validate', { token: distToken }).then(function (res) {
      var data = res && res.data;
      if (res.code !== 200 || !data || !data.valid) {
        throw new Error((res && res.message) || (data && data.message) || '链接无效或已过期');
      }
      if (data.testCode && data.testCode !== testCode) {
        throw new Error('链接与测题不匹配');
      }
      state.validated = true;
      state.linkCode = linkCodeFromToken(distToken);
      return data;
    });
  }

  function startDistTest() {
    if (state.started || unlimited) return Promise.resolve();
    state.started = true;
    return apiPost('/api/links/start-test', { token: distToken }).catch(function (e) {
      state.started = false;
      throw e;
    });
  }

  function completeDistTest(reportData) {
    if (state.completed) return Promise.resolve();
    state.completed = true;
    var result = reportData || {};
    var archetype =
      (result.result && result.result.title) ||
      result.selectedType ||
      (result.extra && result.extra.selectedType) ||
      '';
    var payload = {
      token: distToken,
      resultData: {
        test_code: testCode,
        scale: scaleCode,
        archetype: archetype,
        source: 'xlx_mirror',
        report: result,
      },
    };
    return apiPost('/api/links/complete-test', payload).catch(function (e) {
      state.completed = false;
      console.warn('[xlx-digit] complete-test', e);
    });
  }

  function extractReportFromHistory(raw) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        var latest = parsed[0];
        return latest.reportData || latest;
      }
      if (parsed && parsed.reportData) return parsed.reportData;
    } catch (e) {}
    return null;
  }

  function hookLocalStorage() {
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      origSet.apply(this, arguments);
      if (!state.validated || state.completed) return;
      if (typeof key === 'string' && key.indexOf('history:' + scaleCode) !== -1) {
        var report = extractReportFromHistory(value);
        if (report && (report.result || report.answers)) {
          completeDistTest(report);
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(
                { type: 'psy-xlx-complete', testCode: testCode, report: report },
                origin
              );
            }
          } catch (e) {}
        }
      }
    };
  }

  function showGateError(msg) {
    var el = document.getElementById('app-loading');
    if (el) {
      el.innerHTML =
        '<div style="text-align:center;padding:24px;max-width:320px">' +
        '<p style="color:#c45656;font-size:15px;margin-bottom:8px">无法进入测试</p>' +
        '<p style="color:#909399;font-size:13px;line-height:1.6">' +
        (msg || '链接无效') +
        '</p></div>';
    }
  }

  function patchFetchVerify() {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = ((init && init.method) || 'GET').toUpperCase();

      if (url.indexOf('/api/verify/heartbeat') !== -1) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (url.indexOf('/api/verify') !== -1 && method !== 'GET') {
        var verifyToken = makeVerifyToken(state.linkCode);
        return startDistTest().then(function () {
          seedXlxAuth(verifyToken);
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                verifyToken: verifyToken,
                report_template: 'default',
                scaleCode: scaleCode,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        });
      }

      if (url.indexOf('/api/public/') !== -1) {
        return origFetch
          .call(this, 'https://xlxtest.com' + url.replace(location.origin, ''), init)
          .catch(function () {
            return new Response(JSON.stringify({ code: 200, data: {} }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          });
      }

      if (url.indexOf('/api/') !== -1 && url.indexOf('/api/links/') === -1) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, code: 200, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      return origFetch.apply(this, arguments);
    };
  }

  window.__XLX_DIGIT__ = {
    testCode: testCode,
    scaleCode: scaleCode,
    token: distToken,
    unlimited: unlimited,
  };

  hookLocalStorage();
  patchFetchVerify();

  validateDistToken()
    .then(function () {
      var vt = makeVerifyToken(state.linkCode);
      seedXlxAuth(vt);
      if (window.__PUBLIC_CONFIG__) {
        window.__PUBLIC_CONFIG__.input_placeholder = '已通过分销链接授权，点击开始探索';
      }
    })
    .catch(function (err) {
      showGateError(err && err.message);
    });
})();
