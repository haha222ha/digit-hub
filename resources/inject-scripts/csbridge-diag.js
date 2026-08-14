/**
 * csBridge / XhsRim / ImLoginInfo 一键诊断（chat 页 DevTools 或 API 调用）
 * 暴露：window.__xhsAssistant.diag.runCsBridgeDiag()
 */
;(function () {
  if (window.__xhsCsBridgeDiagReady && window.__xhsAssistant && window.__xhsAssistant.diag && window.__xhsAssistant.diag.runCsBridgeDiag) {
    return
  }
  window.__xhsCsBridgeDiagReady = true

  var errors = window.__xhsCsBridgeDiagErrors || []
  window.__xhsCsBridgeDiagErrors = errors

  if (!window.__xhsCsBridgeDiagHooked) {
    window.__xhsCsBridgeDiagHooked = true
    window.addEventListener('error', function (e) {
      errors.push({ type: 'error', message: e.message, filename: e.filename, lineno: e.lineno })
    })
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason
      errors.push({
        type: 'unhandledrejection',
        message: reason && (reason.message || reason.stack || String(reason))
      })
    })
  }

  function safeKeys(obj, depth) {
    if (!obj || typeof obj !== 'object') return typeof obj
    if (depth <= 0) return '[object]'
    try {
      return Object.keys(obj).slice(0, 80)
    } catch (e) {
      return ['<keys failed>']
    }
  }

  function probeCsBridge(cb) {
    if (!cb) return { present: false }
    var remote = null
    var electron = null
    var probeErr = null
    try {
      remote = cb.getRemote === true ? cb.remote : typeof cb.getRemote === 'function' ? cb.getRemote() : cb.remote || null
    } catch (e) {
      probeErr = 'getRemote: ' + String(e.message || e)
    }
    try {
      electron =
        remote && typeof remote.require === 'function' ? remote.require('electron') : null
    } catch (e) {
      probeErr = (probeErr || '') + ' require(electron): ' + String(e.message || e)
    }
    return {
      present: true,
      topKeys: safeKeys(cb, 1),
      appInfo: cb.appInfo || null,
      supportTab: cb.supportTab,
      supportNewUI: cb.supportNewUI,
      remoteKeys: remote ? safeKeys(remote, 1) : null,
      electronKeys: electron ? safeKeys(electron, 1) : null,
      hasIpcRenderer: !!(electron && electron.ipcRenderer),
      hasSession: !!(electron && electron.session),
      appGetPath:
        remote && remote.app && typeof remote.app.getPath === 'function'
          ? 'function'
          : typeof (remote && remote.app && remote.app.getPath),
      getCurrentWindow:
        typeof cb.getCurrentWindow === 'function'
          ? safeKeys(cb.getCurrentWindow(), 1)
          : 'missing',
      probeErr: probeErr || null
    }
  }

  function readImStore() {
    try {
      var store =
        document.querySelector('#app') &&
        document.querySelector('#app').__vue_app__ &&
        document.querySelector('#app').__vue_app__._context &&
        document.querySelector('#app').__vue_app__._context.provides &&
        document.querySelector('#app').__vue_app__._context.provides.store
      if (!store || !store.state || !store.state.imStore) return { present: false }
      var im = store.state.imStore
      var xu = im.xUserInfo || null
      return {
        present: true,
        xUserInfo: xu
          ? {
              csProviderId: xu.csProviderId || '',
              keys: safeKeys(xu, 1)
            }
          : null,
        imStoreKeys: safeKeys(im, 1)
      }
    } catch (e) {
      return { present: false, error: String(e.message || e) }
    }
  }

  function walkVue2GetRim(vm, depth, seen) {
    if (!vm || depth > 12) return null
    if (seen.has(vm)) return null
    seen.add(vm)
    try {
      if (typeof vm.getRim === 'function') {
        var r = vm.getRim()
        if (r && typeof r.sendTextMsg === 'function') {
          return { rim: r, path: 'vue2.getRim', depth: depth }
        }
      }
    } catch (e) {
      return { error: String(e.message || e), path: 'vue2.getRim throw' }
    }
    var children = vm.$children || []
    for (var i = 0; i < children.length; i++) {
      var hit = walkVue2GetRim(children[i], depth + 1, seen)
      if (hit) return hit
    }
    return null
  }

  function walkVue3GetRim(vnode, depth, seen) {
    if (!vnode || depth > 16) return null
    var key = vnode.component || vnode.el || vnode
    if (seen.has(key)) return null
    seen.add(key)
    try {
      var inst = vnode.component && vnode.component.proxy
      if (inst && typeof inst.getRim === 'function') {
        var r = inst.getRim()
        if (r && typeof r.sendTextMsg === 'function') {
          return { rim: r, path: 'vue3.getRim', depth: depth }
        }
      }
    } catch (e) {
      return { error: String(e.message || e), path: 'vue3.getRim throw' }
    }
    var sub = vnode.component && vnode.component.subTree
    if (sub) {
      var h1 = walkVue3GetRim(sub, depth + 1, seen)
      if (h1) return h1
    }
    if (vnode.children && Array.isArray(vnode.children)) {
      for (var j = 0; j < vnode.children.length; j++) {
        var ch = vnode.children[j]
        if (ch && typeof ch === 'object') {
          var h2 = walkVue3GetRim(ch, depth + 1, seen)
          if (h2) return h2
        }
      }
    }
    return null
  }

  function probeFarmerVue() {
    var out = { present: !!document.querySelector('.farmer-chat-app'), vue2: null, vue3: null, getRim: null }
    try {
      var fc = document.querySelector('.farmer-chat-app')
      if (fc && fc.__vue__) {
        out.vue2 = {
          hasGetRim: typeof fc.__vue__.getRim === 'function',
          hasUserInfo: !!fc.__vue__.userInfo,
          keys: safeKeys(fc.__vue__, 1)
        }
        if (typeof fc.__vue__.getRim === 'function') {
          try {
            var r = fc.__vue__.getRim()
            out.getRim = {
              ok: !!(r && r.sendTextMsg),
              hasRimSdk: !!(r && r.rimSdk),
              keys: r ? safeKeys(r, 1) : null
            }
          } catch (e) {
            out.getRim = { err: String(e.message || e) }
          }
        }
      }
      if (fc && fc.__vueParentComponent && fc.__vueParentComponent.proxy) {
        var p = fc.__vueParentComponent.proxy
        out.vue3 = {
          hasGetRim: typeof p.getRim === 'function',
          keys: safeKeys(p, 1)
        }
      }
    } catch (e) {
      out.err = String(e.message || e)
    }
    return out
  }

  function probeGetRim() {
    var out = { farmerChatApp: !!document.querySelector('.farmer-chat-app'), hits: [] }
    try {
      var fc = document.querySelector('.farmer-chat-app')
      if (fc && fc.__vue__ && typeof fc.__vue__.getRim === 'function') {
        var r0 = fc.__vue__.getRim()
        out.hits.push({
          path: '.farmer-chat-app.__vue__.getRim',
          ok: !!(r0 && r0.sendTextMsg),
          err: null
        })
      }
    } catch (e) {
      out.hits.push({ path: '.farmer-chat-app', ok: false, err: String(e.message || e) })
    }
    try {
      var app = document.querySelector('#app')
      if (app && app.__vue__) {
        var v2 = walkVue2GetRim(app.__vue__, 0, new Set())
        if (v2) out.hits.push({ path: v2.path || 'vue2-walk', ok: !!v2.rim, err: v2.error || null })
      }
      if (app && app.__vue_app__ && app.__vue_app__._instance && app.__vue_app__._instance.subTree) {
        var v3 = walkVue3GetRim(app.__vue_app__._instance.subTree, 0, new Set())
        if (v3) out.hits.push({ path: v3.path || 'vue3-walk', ok: !!v3.rim, err: v3.error || null })
      }
    } catch (e) {
      out.hits.push({ path: 'vue-walk', ok: false, err: String(e.message || e) })
    }
    if (window.__xhsAssistant && window.__xhsAssistant.im && window.__xhsAssistant.im.tryResolveXhsRim) {
      try {
        var rim = window.__xhsAssistant.im.tryResolveXhsRim()
        out.tryResolveXhsRim = !!(rim && rim.sendTextMsg)
      } catch (e) {
        out.tryResolveXhsRimError = String(e.message || e)
      }
    }
    return out
  }

  function runCsBridgeDiag() {
    var cb = window.csBridge
    var report = {
      at: new Date().toISOString(),
      url: location.href,
      csBridge: probeCsBridge(cb),
      xhsRim: {
        type: typeof window.XhsRim,
        hasSendTextMsg: !!(window.XhsRim && window.XhsRim.sendTextMsg),
        hasRimSdk: !!(window.XhsRim && window.XhsRim.rimSdk)
      },
      imLoginInfo: {
        type: typeof window.ImLoginInfo,
        csProviderId: (window.ImLoginInfo && window.ImLoginInfo.csProviderId) || ''
      },
      imStore: readImStore(),
      accessToken: !!localStorage.getItem('accessToken'),
      processType: typeof window.process,
      requireType: typeof window.require,
      farmerVue: probeFarmerVue(),
      getRimProbe: probeGetRim(),
      farmerChatApp: !!document.querySelector('.farmer-chat-app'),
      pageErrors: errors.slice(-30),
      summary: []
    }

    if (!report.csBridge.present) report.summary.push('MISSING: window.csBridge')
    if (report.xhsRim.type === 'undefined') report.summary.push('MISSING: window.XhsRim')
    if (!report.imLoginInfo.csProviderId) report.summary.push('MISSING: ImLoginInfo.csProviderId')
    if (!report.accessToken) report.summary.push('MISSING: localStorage.accessToken')
    if (report.pageErrors.length) report.summary.push('PAGE_ERRORS: ' + report.pageErrors.length)

    console.log('[csBridge-diag]', JSON.stringify(report, null, 2))
    return report
  }

  window.__xhsAssistant = window.__xhsAssistant || { version: '1.0.0' }
  window.__xhsAssistant.diag = window.__xhsAssistant.diag || {}
  window.__xhsAssistant.diag.runCsBridgeDiag = runCsBridgeDiag
  console.log('[XHS Assistant] csbridge-diag 已注入，执行 __xhsAssistant.diag.runCsBridgeDiag()')
})()
