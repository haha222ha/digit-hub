/**
 * xlxtest L3 mirror bootstrap — load synchronously before Vue app.
 * Disables domain lock, mocks verify API, patches history for /xlx-mirror/* subpath.
 */
(function () {
  var MIRROR_BASE = '/xlx-mirror';
  var path = location.pathname || '';
  var onMirror = path.indexOf(MIRROR_BASE) === 0;

  if (window.__PUBLIC_CONFIG__) {
    window.__PUBLIC_CONFIG__.domain_lock_enabled = 0;
    window.__PUBLIC_CONFIG__.domain_lock_domains = '';
  }

  var searchParams = new URLSearchParams(location.search);
  var distToken = searchParams.get('token') || '';
  var integrated = searchParams.get('psy_integrated') === '1' || !!distToken;

  if (integrated && distToken) {
    document.write('<script src="/shared/xlx-digit-integration.js"><\/script>');
  }

  if (onMirror) {
    if (!integrated || !distToken) {
      var VERIFY_TOKEN = 'mirror.' + 'A'.repeat(40);
      try {
        var authPayload = {
          code: 'MIRROR',
          questionnaireKey: 'past',
          scaleCode: 'past',
          verifyToken: VERIFY_TOKEN,
          activatedAt: Date.now(),
          reportTemplate: 'default',
          deviceId: 'mirror-device-001',
        };
        localStorage.setItem('xlxtest_authcode_past', JSON.stringify(authPayload));
      } catch (e) {}
    }

    var origPush = history.pushState;
    var origReplace = history.replaceState;
    function fixUrl(url) {
      if (typeof url !== 'string' || !url.charAt(0) || url.indexOf('http') === 0) return url;
      if (url.indexOf(MIRROR_BASE) === 0) return url;
      return MIRROR_BASE + (url.charAt(0) === '/' ? url : '/' + url);
    }
    history.pushState = function (state, title, url) {
      return origPush.call(this, state, title, fixUrl(url));
    };
    history.replaceState = function (state, title, url) {
      return origReplace.call(this, state, title, fixUrl(url));
    };

    var rest = path.slice(MIRROR_BASE.length) || '/past';
    if (!rest || rest === '/') rest = '/past';
    origReplace.call(history, null, '', rest + location.search + location.hash);

    if (path === MIRROR_BASE || path === MIRROR_BASE + '/') {
      origReplace.call(history, null, '', '/past' + location.search + location.hash);
    }
  }

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init && init.method) || 'GET';

    if (url.indexOf('/api/verify/heartbeat') !== -1) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (url.indexOf('/api/verify') !== -1 && method.toUpperCase() !== 'GET') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              verifyToken: 'mirror.' + 'A'.repeat(40),
              report_template: 'default',
              scaleCode: 'past',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
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

    if (url.indexOf('/api/') !== -1) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, code: 200, data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    return origFetch.apply(this, arguments);
  };
})();
