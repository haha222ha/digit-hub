/**
 * 会员中心会话状态 + 主题
 */
(function (global) {
  'use strict';

  var THEME_KEY = 'xhs_member_portal_theme';
  var THEMES = ['apple', 'aurora', 'classic', 'light', 'warm'];
  var THEME_LABELS = {
    apple: 'Liquid Glass',
    aurora: 'Aurora Neon',
    classic: 'Linear Dark',
    light: 'Geist Light',
    warm: 'Sunset Bento'
  };

  function getToken() {
    try {
      return localStorage.getItem('xhs_member_token') || '';
    } catch (e) {
      return '';
    }
  }

  function loadProfile() {
    try {
      var raw = localStorage.getItem('xhs_member_profile');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function resolveState(profile, hasToken) {
    if (!hasToken) return 'guest';
    if (!profile) return 'logged_in';
    if (profile.is_active === true) return 'member_active';
    if (profile.is_active === false) return 'member_expired';
    return 'logged_in';
  }

  function stateLabel(state) {
    return {
      guest: '访客',
      logged_in: '已登录',
      member_active: '有效会员',
      member_expired: '会员已过期'
    }[state] || '访客';
  }

  function stateHint(state, profile) {
    if (state === 'guest') {
      return '未登录：可先看「免费样例」，需要完整能力请「开通会员」。PC 下载在上方独立 Tab。';
    }
    if (state === 'member_active') {
      var days = profile && profile.days_remaining != null ? profile.days_remaining : '';
      return '欢迎回来' + (profile && profile.username ? '，' + profile.username : '')
        + (days !== '' ? ' · 剩余 ' + days + ' 天' : '') + '。';
    }
    if (state === 'member_expired') {
      return '账号仍有效，但会员已过期。续费后可继续阅读 AI 分析。';
    }
    return '已登录，正在同步会员状态…';
  }

  function applyTheme(name) {
    var theme = THEMES.indexOf(name) >= 0 ? name : 'apple';
    document.documentElement.setAttribute('data-member-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
    var sel = document.getElementById('memberThemeSelect');
    if (sel) sel.value = theme;
    return theme;
  }

  function getTheme() {
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (stored && THEMES.indexOf(stored) >= 0) return stored;
    } catch (e) { /* ignore */ }
    return 'apple';
  }

  function renderSessionActions(state) {
    var box = document.getElementById('sessionStatusActions');
    if (!box) return;

    if (state === 'guest') {
      box.innerHTML = '<button type="button" class="btn btn-ghost ss-btn" onclick="switchPortal(\'login\')">登录</button>'
        + '<button type="button" class="btn btn-primary ss-btn" onclick="switchPortal(\'center\')">开通会员</button>';
      return;
    }

    if (state === 'member_expired') {
      box.innerHTML = '<button type="button" class="btn btn-primary ss-btn" onclick="openBuyFromDash()">扫码续费</button>'
        + '<button type="button" class="btn btn-ghost ss-btn" onclick="switchDash(\'account\')">账户</button>';
      return;
    }

    if (state === 'member_active') {
      box.innerHTML = '<button type="button" class="btn btn-ghost ss-btn" onclick="switchDash(\'archive\')">报告中心</button>'
        + '<button type="button" class="btn btn-ghost ss-btn" onclick="switchDash(\'account\')">账户</button>'
        + '<button type="button" class="btn btn-ghost ss-btn" onclick="openBuyFromDash()">续费</button>';
      return;
    }

    box.innerHTML = '<button type="button" class="btn btn-ghost ss-btn" onclick="switchPortal(\'login\')">登录</button>';
  }

  function renderSessionBar(profile, hasToken) {
    var bar = document.getElementById('sessionStatusBar');
    if (!bar) return resolveState(profile, hasToken);
    var state = resolveState(profile, hasToken);
    bar.dataset.state = state;
    var badge = document.getElementById('sessionStatusBadge');
    var hint = document.getElementById('sessionStatusHint');
    if (badge) badge.textContent = stateLabel(state);
    if (hint) hint.textContent = stateHint(state, profile);
    renderSessionActions(state);
    return state;
  }

  function bindThemeSelect() {
    var sel = document.getElementById('memberThemeSelect');
    if (!sel || sel.dataset.bound) return;
    sel.dataset.bound = '1';
    THEMES.forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = THEME_LABELS[t] || t;
      sel.appendChild(opt);
    });
    sel.value = getTheme();
    sel.addEventListener('change', function () { applyTheme(sel.value); });
  }

  function init() {
    applyTheme(getTheme());
    bindThemeSelect();
    renderSessionBar(loadProfile(), !!getToken());
  }

  global.MemberPortalState = {
    init: init,
    applyTheme: applyTheme,
    getTheme: getTheme,
    renderSessionBar: renderSessionBar,
    resolveState: resolveState,
    loadProfile: loadProfile,
    getToken: getToken
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
