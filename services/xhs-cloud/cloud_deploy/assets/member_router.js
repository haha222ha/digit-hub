/**
 * 会员中心 hash 路由 — ES5
 * 默认入口：报告中心（archive）；today/insight/reports 均映射到 archive
 */

var MemberRouter = (function () {
  'use strict';

  var ROUTES = {
    today: 'archive',
    insight: 'archive',
    archive: 'archive',
    watchlist: 'watchlist',
    client: 'client',
    account: 'account',
    reports: 'archive'
  };

  var current = 'archive';
  var hashBound = false;
  var booted = false;

  function membershipExpired() {
    try {
      var raw = localStorage.getItem('xhs_member_profile');
      if (!raw) return false;
      var m = JSON.parse(raw);
      return m && m.is_active === false;
    } catch (e) {
      return false;
    }
  }

  function normalizeHash() {
    var raw = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw) return membershipExpired() ? 'account' : 'archive';
    // 旧 hash #today / #insight / #reports → 报告中心
    return ROUTES[raw] || raw;
  }

  function applyRoute(name) {
    current = name || 'archive';
    if (current === 'today' || current === 'insight' || current === 'reports') {
      current = 'archive';
    }

    if (current === 'client' && typeof switchTopNav === 'function') {
      switchTopNav('pc');
      return;
    }

    if (membershipExpired() && current !== 'account' && current !== 'client') {
      current = 'account';
    }

    try { localStorage.setItem('xhs_member_dash_tab', current); } catch (e) {}

    document.querySelectorAll('.dash-tab').forEach(function (t) {
      if (t.classList.contains('hidden')) return;
      var dash = t.dataset.dash;
      t.classList.toggle('active', dash === current || (current === 'archive' && (dash === 'today' || dash === 'insight' || dash === 'archive')));
    });

    // 新布局 v2：同步左侧栏 nav-item active + app-panel active
    document.querySelectorAll('.app-sidebar .nav-item[data-app-nav]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-app-nav') === current);
    });

    var panelMap = { today: 'panelArchive', archive: 'panelArchive', watchlist: 'panelWatchlist', account: 'panelAccount' };
    var panelId = panelMap[current];
    document.querySelectorAll('.app-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === panelId);
    });

    // 同步移动端底部导航 active
    document.querySelectorAll('.reader-mobile-nav-btn[data-route]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-route') === current);
    });

    var dashArchive = document.getElementById('dashArchive');
    var dashWatchlist = document.getElementById('dashWatchlist');
    var dashAccount = document.getElementById('dashAccount');
    var expired = membershipExpired();

    if (dashArchive) dashArchive.classList.toggle('hidden', current !== 'archive');
    if (dashWatchlist) dashWatchlist.classList.toggle('hidden', current !== 'watchlist');
    if (dashAccount) dashAccount.classList.toggle('hidden', current !== 'account');

    if (current === 'archive' && window.MemberReader && !expired) {
      if (!booted) {
        booted = true;
        // boot = KPI + 今日数据；报告中心网格由 loadArchive 渲染
        MemberReader.boot().then(function () {
          if (typeof MemberReader.loadArchive === 'function') {
            return MemberReader.loadArchive();
          }
        }).catch(function () { booted = false; });
      } else if (typeof MemberReader.loadArchive === 'function') {
        MemberReader.loadArchive();
      }
    }

    if (current === 'archive' && window.MemberInsight && typeof MemberInsight.load === 'function' && !expired) {
      MemberInsight.load();
    }

    if (current === 'watchlist' && typeof loadWatchlist === 'function') {
      loadWatchlist();
    }

    if (current === 'account' && typeof renderProfile === 'function') {
      var prof = null;
      try {
        var raw = localStorage.getItem('xhs_member_profile');
        if (raw) prof = JSON.parse(raw);
      } catch (e) { /* ignore */ }
      if (prof) renderProfile(prof);
    }
  }

  function go(name, replace) {
    var route = ROUTES[name] || name || 'archive';
    if (route === 'today' || route === 'insight' || route === 'reports') {
      route = 'archive';
    }

    if (route === 'client' && typeof switchTopNav === 'function') {
      switchTopNav('pc');
      return;
    }

    if (membershipExpired() && route !== 'account' && route !== 'client') {
      route = 'account';
    }

    var hash = '#' + route;

    if (replace) {
      history.replaceState(null, '', location.pathname + location.search + hash);
    } else if (location.hash !== hash) {
      // 用 pushState 替代 location.hash = hash，避免浏览器默认滚动行为导致页面"滑走"
      history.pushState(null, '', location.pathname + location.search + hash);
    }

    applyRoute(route);
  }

  function init() {
    var route = normalizeHash();

    // 已登录用户如果 URL hash 是 guest portal tab（login/demo/center），强制跳到报告中心
    var dashView = document.getElementById('dashView');
    var isLoggedIn = dashView && !dashView.classList.contains('hidden');
    if (isLoggedIn && (route === 'login' || route === 'demo' || route === 'center')) {
      route = membershipExpired() ? 'account' : 'archive';
      history.replaceState(null, '', location.pathname + location.search + '#' + route);
    }

    if (location.hash === '#reports' || location.hash === '#insight' || location.hash === '#today') {
      history.replaceState(null, '', location.pathname + location.search + '#archive');
      route = 'archive';
    }

    applyRoute(route);

    if (!hashBound) {
      hashBound = true;
      window.addEventListener('hashchange', function () {
        applyRoute(normalizeHash());
      });

      // pushState 改变了 URL 但不触发 hashchange，需要监听 popstate 让后退/前进按钮正常工作
      window.addEventListener('popstate', function () {
        applyRoute(normalizeHash());
      });
    }
  }

  return {
    go: go,
    init: init,
    current: function () { return current; },
    resetBoot: function () { booted = false; }
  };

})();



function switchDash(name) {
  var map = { insight: 'archive', reports: 'archive', today: 'archive' };
  var route = map[name] || name || 'archive';
  if (window.MemberRouter) MemberRouter.go(route);
  else if (typeof switchAppPanel === 'function') switchAppPanel(route);
}
