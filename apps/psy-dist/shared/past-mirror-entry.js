/**
 * 历史人物匹配 · L3 镜像入口（past_new / past_xlx 共用）
 */
(function () {
  'use strict';

  var PAST_CODES = { past_new: 1, past_xlx: 1 };

  function codesMatch(expected, actual) {
    if (!expected || !actual || expected === actual) return true;
    return !!(PAST_CODES[expected] && PAST_CODES[actual]);
  }

  function boot(testCode) {
    var params = new URLSearchParams(location.search);
    var token = params.get('token') || '';
    var unlimited = params.get('unlimited') === 'true';

    function mirrorSrc() {
      var q = new URLSearchParams();
      q.set('psy_integrated', '1');
      q.set('test_code', testCode);
      q.set('scale', 'past');
      q.set('token', token);
      if (unlimited) q.set('unlimited', 'true');
      return '/xlx-mirror/past?' + q.toString();
    }

    function showError(msg) {
      var gate = document.getElementById('gate');
      if (!gate) return;
      gate.classList.remove('hidden');
      gate.innerHTML =
        '<p style="color:#c45656;font-size:15px;margin:0 24px 8px;text-align:center">链接无效</p>' +
        '<p style="color:#909399;font-size:13px;margin:0 24px;text-align:center;line-height:1.6">' +
        (msg || '请检查分销链接是否过期') +
        '</p>';
    }

    if (!token) {
      showError('缺少访问令牌，请通过分销链接打开');
      return;
    }

    if (typeof PsyTestValidator === 'undefined') {
      showError('验证组件加载失败，请刷新重试');
      return;
    }

    PsyTestValidator.init(testCode, {
      onSuccess: function (result) {
        if (result && result.testCode && !codesMatch(testCode, result.testCode)) {
          showError('链接与测题不匹配');
          return;
        }
        location.replace(mirrorSrc());
      },
      onError: function (err) {
        showError((err && err.message) || '链接校验失败');
      },
    });

    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.type !== 'psy-xlx-complete') return;
      if (ev.origin !== location.origin) return;
      if (typeof PsyTestValidator === 'undefined') return;
      var v = PsyTestValidator.getInstance && PsyTestValidator.getInstance();
      if (v && typeof v.completeTest === 'function' && !v._xlxCompleted) {
        v._xlxCompleted = true;
        v.completeTest(undefined, ev.data.report || {});
      }
    });
  }

  window.PsyPastMirrorEntry = { boot: boot, codesMatch: codesMatch };
})();
