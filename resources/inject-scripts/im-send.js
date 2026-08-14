/**
 * 虚拟发货 IM 桥 — 对标阿奇锁历史版 xhsImPreload.ts（主动 getRim 挂载）
 * 依赖：dashboard 页 .farmer-chat-app.__vue__.getRim() → window.XhsRim
 *
 * 暴露：window.__xhsAssistant.im
 */
(function () {
  var SCRIPT_VER = 'agiso-v4-deepRim'
  var ZELDA_WS_URL = 'wss://zelda.xiaohongshu.com/websocketV2'
  var CHAT_SDK_VERSION = 'v0.0.5'
  var CANCEL_TOKEN = encodeURIComponent('{"promise":{}}')
  var XHS_IM_LOGIN_URL = 'https://walle.xiaohongshu.com/cstools/login'

  if (
    window.__xhsImSendReady === SCRIPT_VER &&
    window.__xhsAssistant &&
    window.__xhsAssistant.im &&
    typeof window.__xhsAssistant.im.deliverByOrderSn === 'function' &&
    typeof window.__xhsAssistant.im.checkImHealth === 'function' &&
    typeof window.__xhsAssistant.im.sendTextViaImpaasWs === 'function'
  ) {
    return
  }
  window.__xhsImSendReady = SCRIPT_VER

  function imWarn(e) {
    try {
      console.warn('[IMSend]', e && (e.message || e))
    } catch (_ignore) {}
  }

  /** impaas zelda WebSocket 直发（dashboard 通道，不依赖 XhsRim） */
  var _rootWin = window.top || window
  var _wsState = _rootWin.__xhsImWsState || {
    installed: false,
    zeldaSockets: [],
    lastSeq: 0,
    pendingAcks: {}
  }
  _rootWin.__xhsImWsState = _wsState
  window.__xhsImWsState = _wsState

  function b64NoPad(str) {
    try {
      return btoa(unescape(encodeURIComponent(str))).replace(/=+$/, '')
    } catch (e) {
      return btoa(str).replace(/=+$/, '')
    }
  }

  function buildAppCid(buyerId, csProviderId) {
    var buyerUid = '1#2#2#' + buyerId
    var sellerUid = '1#3#6#' + csProviderId
    return '$3$' + b64NoPad(buyerUid) + '.' + b64NoPad(sellerUid)
  }

  function randomHex32() {
    var s = ''
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
  }

  /** 抓包实测 traceId 均以 cfffd 开头 */
  function randomTraceId() {
    return 'cfffd' + randomHex32().slice(5)
  }

  function randomSMid() {
    return randomHex32().slice(0, 13) + '-' + Date.now().toString(16).slice(-10)
  }

  function randomTextUuid() {
    return 'text-' + randomHex32().slice(0, 13) + '-' + Date.now().toString(16).slice(-10)
  }

  function randomUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      var v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  function parseWsJson(data) {
    try {
      return typeof data === 'string' ? JSON.parse(data) : null
    } catch (e) {
      return null
    }
  }

  function trackSeqFromPayload(payload) {
    if (payload && payload.header && typeof payload.header.seq === 'number') {
      _wsState.lastSeq = Math.max(_wsState.lastSeq, payload.header.seq)
    }
  }

  function handleWsMessage(data) {
    var msg = parseWsJson(data)
    if (!msg || !msg.header) return
    trackSeqFromPayload(msg)
    var hdr = msg.header
    if (hdr.type === 131 && hdr.action === '/message/send' && hdr.traceId) {
      var pending = _wsState.pendingAcks[hdr.traceId]
      if (pending) {
        delete _wsState.pendingAcks[hdr.traceId]
        clearTimeout(pending.timer)
        var body = msg.body || {}
        if (body.code === 0) pending.resolve(body)
        else pending.reject(new Error((body.msg || 'send failed') + ' code=' + body.code))
      }
    }
  }

  function registerZeldaSocket(ws) {
    if (!ws || ws.__xhsZeldaTracked) return
    var url = ws.url || ''
    if (!/zelda\.xiaohongshu\.com/i.test(url)) return
    ws.__xhsZeldaTracked = true
    _wsState.zeldaSockets.push(ws)
    ws.addEventListener('message', function (ev) {
      handleWsMessage(ev.data)
    })
  }

  function installWsHook() {
    // 即使 preload 已安装 hook（_wsState.installed=true），仍需追加 handleWsMessage 监听器
    // 处理 /message/send ACK 回执
    if (!_wsState.installed) {
      _wsState.installed = true
      var hookTarget = _rootWin
      var OrigPS = hookTarget.WebSocket
      if (!OrigPS || !OrigPS.prototype) return

      var origSend = OrigPS.prototype.send
      OrigPS.prototype.send = function (data) {
        registerZeldaSocket(this)
        var parsed = parseWsJson(data)
        if (parsed) trackSeqFromPayload(parsed)
        return origSend.call(this, data)
      }

      var origAdd = OrigPS.prototype.addEventListener
      OrigPS.prototype.addEventListener = function (type, listener, options) {
        registerZeldaSocket(this)
        if (type === 'message' && typeof listener === 'function') {
          var self = this
          var wrapped = function (ev) {
            handleWsMessage(ev.data)
            return listener.call(self, ev)
          }
          return origAdd.call(this, type, wrapped, options)
        }
        return origAdd.call(this, type, listener, options)
      }

      function HookedWebSocket(url, protocols) {
        var ws =
          protocols !== undefined && protocols !== null
            ? new OrigPS(url, protocols)
            : new OrigPS(url)
        registerZeldaSocket(ws)
        return ws
      }
      HookedWebSocket.prototype = OrigPS.prototype
      ;['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) {
        try {
          HookedWebSocket[k] = OrigPS[k]
        } catch (e) { imWarn(e) }
      })
      hookTarget.WebSocket = HookedWebSocket
      if (hookTarget !== window) {
        try {
          window.WebSocket = HookedWebSocket
        } catch (e) { imWarn(e) }
      }
    }

    // ★ 给 preload 已注册的 socket 追加 handleWsMessage 监听器
    // （preload 的 hook 只追踪 lastSeq，不处理 /message/send ACK）
    for (var i = 0; i < _wsState.zeldaSockets.length; i++) {
      var ws = _wsState.zeldaSockets[i]
      if (!ws.__xhsAssistantMsgHooked) {
        ws.__xhsAssistantMsgHooked = true
        ;(function (socket) {
          socket.addEventListener('message', function (ev) {
            handleWsMessage(ev.data)
          })
        })(ws)
      }
    }
  }

  installWsHook()

  function getZeldaWs() {
    // ★ 首先检查主窗口的 zeldaSockets
    for (var i = _wsState.zeldaSockets.length - 1; i >= 0; i--) {
      var ws = _wsState.zeldaSockets[i]
      if (ws && ws.readyState === 1 && !ws.__xhsAssistantWs) return ws
    }
    for (var j = _wsState.zeldaSockets.length - 1; j >= 0; j--) {
      var ws2 = _wsState.zeldaSockets[j]
      if (ws2 && ws2.readyState === 1) return ws2
    }
    // ★ 检查 iframe 中的 zeldaSockets（mio-chat iframe 的 WS）
    try {
      var iframes = document.querySelectorAll('iframe')
      for (var k = 0; k < iframes.length; k++) {
        var win = iframes[k].contentWindow
        if (!win || !win.__xhsImWsState) continue
        var iframeSockets = win.__xhsImWsState.zeldaSockets || []
        for (var m = iframeSockets.length - 1; m >= 0; m--) {
          var ws3 = iframeSockets[m]
          if (ws3 && ws3.readyState === 1) {
            // 追加 handleWsMessage 监听器
            if (!ws3.__xhsAssistantMsgHooked) {
              ws3.__xhsAssistantMsgHooked = true
              ;(function (socket) {
                socket.addEventListener('message', function (ev) {
                  handleWsMessage(ev.data)
                })
              })(ws3)
            }
            return ws3
          }
        }
      }
    } catch (e) {
      /* cross-origin */
    }
    return null
  }

  function isWsReady() {
    return !!getZeldaWs()
  }

  function getWsDiag() {
    return {
      socketCount: _wsState.zeldaSockets.length,
      openCount: _wsState.zeldaSockets.filter(function (w) {
        return w && w.readyState === 1
      }).length,
      lastSeq: _wsState.lastSeq,
      hookInstalled: !!_wsState.installed
    }
  }

  var _assistantWsConnecting = null

  /** 页面 IM 未建连时，用同域 Cookie 自建 zelda WS（对标 dashboard 真人聊天通道） */
  function connectAssistantZeldaWs(timeoutMs) {
    timeoutMs = timeoutMs || 12000
    var existing = getZeldaWs()
    if (existing) return Promise.resolve(existing)
    if (_assistantWsConnecting) return _assistantWsConnecting
    _assistantWsConnecting = new Promise(function (resolve, reject) {
      var done = false
      var timer = setTimeout(function () {
        if (done) return
        done = true
        _assistantWsConnecting = null
        reject(new Error('自建 zelda WS 连接超时'))
      }, timeoutMs)
      try {
        var ws = new WebSocket(ZELDA_WS_URL)
        ws.__xhsAssistantWs = true
        registerZeldaSocket(ws)
        ws.addEventListener('open', function () {
          if (done) return
          done = true
          clearTimeout(timer)
          _assistantWsConnecting = null
          console.log('[IMSend] 自建 zelda WS 已连接')
          resolve(ws)
        })
        ws.addEventListener('error', function () {
          if (done) return
          done = true
          clearTimeout(timer)
          _assistantWsConnecting = null
          reject(new Error('自建 zelda WS 连接失败'))
        })
        ws.addEventListener('close', function () {
          if (done) return
          done = true
          clearTimeout(timer)
          _assistantWsConnecting = null
          reject(new Error('自建 zelda WS 连接关闭'))
        })
      } catch (e) {
        clearTimeout(timer)
        _assistantWsConnecting = null
        reject(e)
      }
    })
    return _assistantWsConnecting
  }

  async function waitForWsHandshake(ws, timeoutMs) {
    timeoutMs = timeoutMs || 5000
    if (_wsState.lastSeq > 0) return
    await new Promise(function (resolve) {
      var done = false
      var timer = setTimeout(function () {
        if (done) return
        done = true
        resolve()
      }, timeoutMs)
      var handler = function (ev) {
        handleWsMessage(ev.data)
        if (_wsState.lastSeq > 0 && !done) {
          done = true
          clearTimeout(timer)
          ws.removeEventListener('message', handler)
          resolve()
        }
      }
      ws.addEventListener('message', handler)
    })
  }

  async function ensureZeldaWs(timeoutMs) {
    timeoutMs = timeoutMs || 15000
    var ws = getZeldaWs()
    if (ws) {
      await waitForWsHandshake(ws, 3000)
      return ws
    }
    var deadline = Date.now() + timeoutMs
    var triedConnect = false
    while (Date.now() < deadline) {
      ws = getZeldaWs()
      if (ws) {
        await waitForWsHandshake(ws, 3000)
        return ws
      }
      if (!triedConnect && getWsDiag().socketCount === 0 && deadline - Date.now() > 4000) {
        triedConnect = true
        try {
          ws = await connectAssistantZeldaWs(Math.min(10000, deadline - Date.now()))
          await waitForWsHandshake(ws, 5000)
          return ws
        } catch (e) {
          console.warn('[IMSend] connectAssistantZeldaWs:', e && e.message ? e.message : e)
        }
      }
      await new Promise(function (r) {
        setTimeout(r, 300)
      })
    }
    throw new Error(
      'zelda WebSocket 未就绪（socketCount=' +
        getWsDiag().socketCount +
        ' open=' +
        getWsDiag().openCount +
        ' lastSeq=' +
        _wsState.lastSeq +
        '）'
    )
  }

  function waitForZeldaWs(timeoutMs) {
    return ensureZeldaWs(timeoutMs)
  }

  function waitForWsSendAck(traceId, timeoutMs) {
    timeoutMs = timeoutMs || 12000
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        delete _wsState.pendingAcks[traceId]
        reject(new Error('WS /message/send 回执超时 traceId=' + traceId))
      }, timeoutMs)
      _wsState.pendingAcks[traceId] = { resolve: resolve, reject: reject, timer: timer }
    })
  }

  async function sendTextViaImpaasWs(content, buyerId, csProviderId) {
    await waitForImLoginInfo(10000)
    if (!csProviderId) csProviderId = getCsProviderId()
    if (!csProviderId) throw new Error('ImLoginInfo.csProviderId 未就绪')
    var ws = await waitForZeldaWs(15000)
    await waitForWsHandshake(ws, 4000)
    var appCid = buildAppCid(buyerId, csProviderId)
    var receiverAppUid = '1#2#2#' + buyerId
    var traceId = randomTraceId()
    var sMid = randomSMid()
    var seq = _wsState.lastSeq + 1
    var now = Date.now()
    var frame = {
      header: {
        sTime: now,
        seq: seq,
        type: 3,
        bizId: 10,
        contentType: 'json',
        traceId: traceId,
        action: '/message/send',
        serviceId: 'impaas.oi',
        oneWay: false,
        sMid: sMid
      },
      body: {
        appCid: appCid,
        convType: 1,
        uuid: randomTextUuid(),
        receiverAppUids: [receiverAppUid],
        contentInfo: { contentType: 1, content: String(content) },
        convCreateIsSelfVisible: true,
        convRedPointIsNotSelfClear: true,
        extension: {
          additionInfo: JSON.stringify({ uuid: randomUuid(), sendMsgDoubleCheck: false })
        },
        callbackCtx: {}
      }
    }
    _wsState.lastSeq = seq
    var ackPromise = waitForWsSendAck(traceId, 12000)
    ws.send(JSON.stringify(frame))
    var ack = await ackPromise
    return { appCid: appCid, ack: ack, via: 'impaas-ws' }
  }

  function getAccessToken() {
    return (
      localStorage.getItem('accessToken') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('auth-token') ||
      ''
    )
  }

  function scanDomForGetRim() {
    var hits = []
    var fc = document.querySelector('.farmer-chat-app')
    var root = fc || document.querySelector('#app') || document.body
    if (!root) return hits
    var nodes = root.querySelectorAll ? root.querySelectorAll('*') : []
    var limit = Math.min(nodes.length, 800)
    for (var i = 0; i < limit; i++) {
      var el = nodes[i]
      try {
        if (el.__vue__ && typeof el.__vue__.getRim === 'function') {
          var r0 = el.__vue__.getRim()
          if (r0) hits.push({ rim: r0, path: 'dom.__vue__.getRim[' + i + ']' })
        }
        var vpc = el.__vueParentComponent
        if (vpc) {
          var targets = [vpc.proxy, vpc.exposed, vpc.setupState, vpc.ctx]
          for (var ti = 0; ti < targets.length; ti++) {
            var t = targets[ti]
            if (t && typeof t.getRim === 'function') {
              var r1 = t.getRim()
              if (r1) hits.push({ rim: r1, path: 'dom.__vueParentComponent[' + i + ']' })
            }
          }
        }
      } catch (e) { imWarn(e) }
    }
    return hits
  }

  /** 解析 farmer-chat-app 上的 rim / userInfo / services（Vue2 + Vue3） */
  function resolveFarmerImContext() {
    var fc = document.querySelector('.farmer-chat-app')
    if (!fc) return null
    var el = fc
    for (var depth = 0; depth < 12 && el; depth++) {
      try {
        if (el.__vue__ && typeof el.__vue__.getRim === 'function') {
          var r0 = el.__vue__.getRim()
          if (r0) {
            return {
              rim: r0,
              imLoginInfo: el.__vue__.userInfo,
              xhsApiService: el.__vue__.$parent && el.__vue__.$parent.services,
              version: el.__vue__.$parent && el.__vue__.$parent.version,
              router: el.__vue__.$router
            }
          }
        }
        if (el.__vueParentComponent && el.__vueParentComponent.proxy) {
          var p = el.__vueParentComponent.proxy
          if (typeof p.getRim === 'function') {
            var r1 = p.getRim()
            if (r1) {
              return {
                rim: r1,
                imLoginInfo: p.userInfo,
                xhsApiService: (p.$parent && p.$parent.services) || null,
                version: (p.$parent && p.$parent.version) || null,
                router: p.$router
              }
            }
          }
        }
      } catch (e) { imWarn(e) }
      el = el.parentElement
    }
    try {
      var app = document.querySelector('#app')
      if (app && app.__vue_app__ && app.__vue_app__._instance && app.__vue_app__._instance.subTree) {
        var raw = walkVue3GetRim(app.__vue_app__._instance.subTree, 0, new Set())
        if (raw) {
          return {
            rim: raw,
            imLoginInfo: readImLoginInfo(),
            xhsApiService: window.XhsApiService || null,
            version: null,
            router: null
          }
        }
      }
    } catch (e2) {}
    var storeHits = scanStoreForRim()
    if (storeHits.length > 0 && storeHits[0].rim) {
      return {
        rim: storeHits[0].rim,
        imLoginInfo: readImLoginInfo(),
        xhsApiService: window.XhsApiService || null,
        version: null,
        router: null,
        _path: storeHits[0].path
      }
    }
    var winHits = scanWindowForRim()
    if (winHits.length > 0 && winHits[0].rim) {
      return {
        rim: winHits[0].rim,
        imLoginInfo: readImLoginInfo(),
        xhsApiService: window.XhsApiService || null,
        version: null,
        router: null,
        _path: winHits[0].path
      }
    }
    var iframeHits = probeIframeForRim()
    if (iframeHits.length > 0 && iframeHits[0].rim) {
      return {
        rim: iframeHits[0].rim,
        imLoginInfo: readImLoginInfo(),
        xhsApiService: window.XhsApiService || null,
        version: null,
        router: null,
        _path: iframeHits[0].path
      }
    }
    var domHits = scanDomForGetRim()
    if (domHits.length > 0 && domHits[0].rim) {
      return {
        rim: domHits[0].rim,
        imLoginInfo: readImLoginInfo(),
        xhsApiService: window.XhsApiService || null,
        version: null,
        router: null,
        _path: domHits[0].path
      }
    }
    return null
  }

  /** farmer-chat-app Vue2 实例（历史版 imAppVue） */
  function getImAppVue() {
    var ctx = resolveFarmerImContext()
    if (ctx && ctx.rim) {
      return {
        getRim: function () {
          return ctx.rim
        },
        userInfo: ctx.imLoginInfo,
        $parent: { services: ctx.xhsApiService, version: ctx.version },
        $router: ctx.router
      }
    }
    var fc = document.querySelector('.farmer-chat-app')
    return fc && fc.__vue__ ? fc.__vue__ : null
  }

  /**
   * 对标历史版 getXhsAPI()：主动 getRim() → window.XhsRim / ImLoginInfo / XhsApiService
   */
  function getXhsAPI() {
    if (window.__xhsGetXhsApiInterval) return
    var nudgeAt = 0
    window.__xhsGetXhsApiInterval = setInterval(function () {
      try {
        if (window.XhsRim && window.ImLoginInfo) {
          clearInterval(window.__xhsGetXhsApiInterval)
          window.__xhsGetXhsApiInterval = null
          return
        }
        var now = Date.now()
        if (now - nudgeAt > 8000) {
          nudgeAt = now
          tryNudgeImSdkInit()
        }
        var ctx = resolveFarmerImContext()
        if (!ctx || !ctx.rim) return
        var imLoginInfo = ctx.imLoginInfo
        if (!imLoginInfo || !imLoginInfo.csProviderId) {
          imLoginInfo = readImLoginInfo()
        }
        if (!imLoginInfo || !imLoginInfo.csProviderId) return
        clearInterval(window.__xhsGetXhsApiInterval)
        window.__xhsGetXhsApiInterval = null
        if (ctx.version) CHAT_SDK_VERSION = ctx.version
        if (ctx.router) window.VueRouter = ctx.router
        window.XhsRim = ctx.rim
        if (ctx.xhsApiService) window.XhsApiService = ctx.xhsApiService
        window.ImLoginInfo = imLoginInfo
        console.log(
          '[IMSend] getXhsAPI OK csProviderId=' +
            (imLoginInfo.csProviderId || '') +
            (ctx._path ? ' via=' + ctx._path : '')
        )
      } catch (e) {
        console.warn('[IMSend] getXhsAPI err', e)
      }
    }, 500)
  }

  /** 对标历史版 goReLogin：401 时跳回登录页 */
  function goReLogin() {
    setTimeout(function () {
      try {
        if (window.location.href !== XHS_IM_LOGIN_URL) {
          window.location.href = XHS_IM_LOGIN_URL
        }
      } catch (e) { imWarn(e) }
    }, 200)
  }

  /** 对标历史版 checkXhsTicketExpired：检查 imToken + 401 + SDK_NOT_READY */
  async function checkXhsTicketExpired() {
    var needToLogin = false
    try {
      var userInfoRaw = localStorage.getItem('userInfo')
      if (!userInfoRaw) {
        needToLogin = true
        return
      }
      var imToken = null
      try {
        imToken = JSON.parse(userInfoRaw).imToken
      } catch (e) { imWarn(e) }
      if (!imToken) {
        needToLogin = true
        return
      }
      var url =
        'https://wario.xiaohongshu.com/api/wario/sdk/metrics/custom/seller_queuing_info?im_token=' +
        encodeURIComponent(imToken)
      var sellerQueuingInfo = await fetch(url)
      if (sellerQueuingInfo && sellerQueuingInfo.status === 401) {
        needToLogin = true
        return
      }
      var rim = getActiveRim()
      if (rim && rim.rimSdk && rim.rimSdk.imSdk && rim.rimSdk.imSdk.state === 'SDK_NOT_READY') {
        var elements = document.querySelectorAll('.header')
        for (var i = 0; i < elements.length; i++) {
          if (elements[i].textContent && elements[i].textContent.indexOf('登录认证已过期') >= 0) {
            needToLogin = true
            return
          }
        }
      }
    } catch (error) {
      console.warn('[IMSend] checkXhsTicketExpired Error', error)
    } finally {
      if (needToLogin) goReLogin()
    }
  }

  var checkXhsTicketExpiredInterval = null
  function startCheckXhsTicketExpired() {
    checkXhsTicketExpired().then(function () {
      if (checkXhsTicketExpiredInterval) clearInterval(checkXhsTicketExpiredInterval)
      checkXhsTicketExpiredInterval = setInterval(checkXhsTicketExpired, 30 * 1000)
    })
  }

  /** ImLoginInfo 优先 imAppVue.userInfo（历史版），勿用 imStore.xUserInfo 顶替 */
  function readImLoginInfo() {
    try {
      var imAppVue = getImAppVue()
      if (imAppVue && imAppVue.userInfo && imAppVue.userInfo.csProviderId) {
        window.ImLoginInfo = imAppVue.userInfo
        return imAppVue.userInfo
      }
      if (window.ImLoginInfo && window.ImLoginInfo.csProviderId) {
        return window.ImLoginInfo
      }
      var app = document.querySelector('#app')
      var info =
        app &&
        app.__vue_app__ &&
        app.__vue_app__._context &&
        app.__vue_app__._context.provides &&
        app.__vue_app__._context.provides.store &&
        app.__vue_app__._context.provides.store.state &&
        app.__vue_app__._context.provides.store.state.imStore &&
        app.__vue_app__._context.provides.store.state.imStore.xUserInfo
      if (info && info.csProviderId) {
        return info
      }
    } catch (e) { imWarn(e) }
    return window.ImLoginInfo || null
  }

  function waitForImLoginInfo(timeoutMs) {
    timeoutMs = timeoutMs || 15000
    getXhsAPI()
    return new Promise(function (resolve) {
      var info = readImLoginInfo()
      if (info && info.csProviderId) {
        resolve(info)
        return
      }
      var deadline = Date.now() + timeoutMs
      var timer = setInterval(function () {
        info = readImLoginInfo()
        if ((info && info.csProviderId) || Date.now() >= deadline) {
          clearInterval(timer)
          resolve(info || null)
        }
      }, 100)
    })
  }

  function getCsProviderId() {
    var info = readImLoginInfo()
    if (info && info.csProviderId) return String(info.csProviderId)
    if (window.ImLoginInfo && window.ImLoginInfo.csProviderId) {
      return String(window.ImLoginInfo.csProviderId)
    }
    return ''
  }

  function getSellerId() {
    return getCsProviderId()
  }

  /** 完整 XhsRim：发消息 + getChatInfo 缺一不可 */
  function isFullXhsRim(rim) {
    return !!(
      rim &&
      typeof rim.sendTextMsg === 'function' &&
      rim.rimSdk &&
      typeof rim.rimSdk.getChatInfo === 'function'
    )
  }

  function hasSendRim(rim) {
    return !!(rim && typeof rim.sendTextMsg === 'function')
  }

  function pickGetChatInfo(rim) {
    if (!rim) rim = getActiveRim()
    if (rim && rim.rimSdk && typeof rim.rimSdk.getChatInfo === 'function') {
      return rim.rimSdk.getChatInfo.bind(rim.rimSdk)
    }
    if (rim && typeof rim.getChatInfo === 'function') {
      return rim.getChatInfo.bind(rim)
    }
    if (window.rimSdk && typeof window.rimSdk.getChatInfo === 'function') {
      return window.rimSdk.getChatInfo.bind(window.rimSdk)
    }
    return null
  }

  /** dashboard 嵌入的 .farmer-chat-app → getRim()（不依赖 window.XhsRim 全局） */
  function normalizeRim(raw) {
    if (!raw || typeof raw !== 'object') return null
    if (typeof raw.sendTextMsg === 'function') {
      return {
        sendTextMsg: raw.sendTextMsg.bind(raw),
        sendImageMsg: raw.sendImageMsg && raw.sendImageMsg.bind(raw),
        sendCustomMsg: raw.sendCustomMsg && raw.sendCustomMsg.bind(raw),
        rimSdk: raw.rimSdk || raw
      }
    }
    var sdk = raw.rimSdk || raw
    if (sdk && typeof sdk === 'object' && typeof sdk.sendTextMsg === 'function') {
      return {
        sendTextMsg: sdk.sendTextMsg.bind(sdk),
        sendImageMsg: sdk.sendImageMsg && sdk.sendImageMsg.bind(sdk),
        sendCustomMsg: sdk.sendCustomMsg && sdk.sendCustomMsg.bind(sdk),
        rimSdk: sdk
      }
    }
    return null
  }

  function rimFromVue3Target(t, path) {
    if (!t || typeof t !== 'object') return null
    try {
      if (typeof t.getRim === 'function') {
        var r0 = t.getRim()
        if (isFullXhsRim(r0) || hasSendRim(r0)) return { rim: r0, path: path + '.getRim()' }
      }
      if (isFullXhsRim(t.rim)) return { rim: t.rim, path: path + '.rim' }
      if (isFullXhsRim(t.xhsRim)) return { rim: t.xhsRim, path: path + '.xhsRim' }
      if (isFullXhsRim(t.jarvisRim)) return { rim: t.jarvisRim, path: path + '.jarvisRim' }
    } catch (e) { imWarn(e) }
    return null
  }

  function walkVue3GetRim(vnode, depth, seen) {
    if (!vnode || depth > 32) return null
    var key = (vnode.component && vnode.component.uid) || vnode.el || vnode
    if (seen.has(key)) return null
    seen.add(key)
    try {
      var comp = vnode.component
      if (comp) {
        var targets = [
          ['proxy', comp.proxy],
          ['exposed', comp.exposed],
          ['setupState', comp.setupState],
          ['ctx', comp.ctx],
          ['data', comp.data],
          ['props', comp.props]
        ]
        for (var ti = 0; ti < targets.length; ti++) {
          var hit = rimFromVue3Target(targets[ti][1], 'vue3.' + targets[ti][0] + '@d' + depth)
          if (hit) return hit.rim
        }
      }
    } catch (e) { imWarn(e) }
    var sub = vnode.component && vnode.component.subTree
    if (sub) {
      var h1 = walkVue3GetRim(sub, depth + 1, seen)
      if (h1) return h1
    }
    if (vnode.suspense && vnode.suspense.activeBranch) {
      var hSusp = walkVue3GetRim(vnode.suspense.activeBranch, depth + 1, seen)
      if (hSusp) return hSusp
    }
    if (vnode.component && vnode.component.suspense && vnode.component.suspense.activeBranch) {
      var hSusp2 = walkVue3GetRim(vnode.component.suspense.activeBranch, depth + 1, seen)
      if (hSusp2) return hSusp2
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

  function deepScanObjectForRim(obj, path, depth, seen, hits) {
    if (!obj || depth > 6) return
    if (typeof obj !== 'object') return
    if (seen.has(obj)) return
    seen.add(obj)
    try {
      if (isFullXhsRim(obj)) {
        hits.push({ rim: obj, path: path })
        return
      }
      if (hasSendRim(obj) && obj.rimSdk) {
        hits.push({ rim: obj, path: path + '(partial)' })
      }
    } catch (e) { imWarn(e) }
    var keys
    try {
      keys = Object.keys(obj)
    } catch (e2) {
      return
    }
    for (var i = 0; i < keys.length && i < 80; i++) {
      var k = keys[i]
      if (k === '__proto__' || k === 'parent' || k === '$parent') continue
      try {
        deepScanObjectForRim(obj[k], path + '.' + k, depth + 1, seen, hits)
      } catch (e3) {}
    }
  }

  function scanStoreForRim() {
    var hits = []
    try {
      var app = document.querySelector('#app')
      var store =
        app &&
        app.__vue_app__ &&
        app.__vue_app__._context &&
        app.__vue_app__._context.provides &&
        app.__vue_app__._context.provides.store
      if (store && store.state) {
        deepScanObjectForRim(store.state, 'store.state', 0, new Set(), hits)
      }
      if (store && store._state && store._state.data) {
        deepScanObjectForRim(store._state.data, 'store._state.data', 0, new Set(), hits)
      }
    } catch (e) { imWarn(e) }
    return hits
  }

  function scanWindowForRim() {
    var hits = []
    var names = [
      'XhsRim', 'xhsRim', '__XHS_RIM__', 'JarvisIM', 'jarvisIM', '__JARVIS_IM__',
      'rimSdk', 'RimSdk', '__rim__', 'farmerRim', 'imRim'
    ]
    for (var i = 0; i < names.length; i++) {
      try {
        var v = window[names[i]]
        if (isFullXhsRim(v)) hits.push({ rim: v, path: 'window.' + names[i] })
        else if (v && typeof v === 'object' && isFullXhsRim(v.rim)) {
          hits.push({ rim: v.rim, path: 'window.' + names[i] + '.rim' })
        }
      } catch (e) { imWarn(e) }
    }
    return hits
  }

  function probeIframeForRim() {
    var hits = []
    try {
      var frames = document.querySelectorAll('iframe')
      for (var i = 0; i < frames.length; i++) {
        try {
          var doc = frames[i].contentDocument || (frames[i].contentWindow && frames[i].contentWindow.document)
          if (!doc) continue
          var fc = doc.querySelector('.farmer-chat-app')
          if (fc && fc.__vue__ && typeof fc.__vue__.getRim === 'function') {
            var r = fc.__vue__.getRim()
            if (r) hits.push({ rim: r, path: 'iframe[' + i + '].__vue__.getRim' })
          }
        } catch (e) { imWarn(e) }
      }
    } catch (e2) {}
    return hits
  }

  function deepProbeRim() {
    var report = {
      at: Date.now(),
      url: location.href,
      farmerChatApp: !!document.querySelector('.farmer-chat-app'),
      hits: [],
      storeHits: [],
      windowHits: [],
      iframeHits: [],
      devtoolsApps: 0
    }
    try {
      var ctx = resolveFarmerImContext()
      if (ctx && ctx.rim) report.hits.push({ path: 'resolveFarmerImContext', ok: true })
    } catch (e) {
      report.hits.push({ path: 'resolveFarmerImContext', err: String(e.message || e) })
    }
    report.storeHits = scanStoreForRim().map(function (h) {
      return { path: h.path, full: isFullXhsRim(h.rim) }
    })
    report.windowHits = scanWindowForRim().map(function (h) {
      return { path: h.path, full: isFullXhsRim(h.rim) }
    })
    report.iframeHits = probeIframeForRim().map(function (h) {
      return { path: h.path, full: isFullXhsRim(h.rim) }
    })
    try {
      var hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
      if (hook && hook.apps) report.devtoolsApps = hook.apps.length
    } catch (e2) {}
    report.mounted = !!(window.XhsRim && hasSendRim(window.XhsRim))
    return report
  }

  function tryNudgeImSdkInit() {
    try {
      var app = document.querySelector('#app')
      var store =
        app &&
        app.__vue_app__ &&
        app.__vue_app__._context &&
        app.__vue_app__._context.provides &&
        app.__vue_app__._context.provides.store
      if (store) {
        var actions = ['initRim', 'initImSdk', 'initIm', 'fetchImConfig', 'bootstrapIm']
        for (var i = 0; i < actions.length; i++) {
          if (typeof store.dispatch === 'function' && store._actions && store._actions[actions[i]]) {
            try {
              store.dispatch(actions[i])
            } catch (e) { imWarn(e) }
          }
        }
      }
      var tab = document.querySelector('[class*="chat"], [data-tab="chat"], .im-tab, .chat-tab')
      if (tab && typeof tab.click === 'function') tab.click()
    } catch (e) { imWarn(e) }
  }

  function rimFromFarmerChatApp() {
    var fc = document.querySelector('.farmer-chat-app')
    if (!fc) return null
    var el = fc
    for (var depth = 0; depth < 10 && el; depth++) {
      try {
        if (el.__vue__ && typeof el.__vue__.getRim === 'function') {
          var r0 = el.__vue__.getRim()
          if (r0) return r0
        }
        if (el.__vueParentComponent && el.__vueParentComponent.proxy) {
          var p = el.__vueParentComponent.proxy
          if (typeof p.getRim === 'function') {
            var r1 = p.getRim()
            if (r1) return r1
          }
        }
      } catch (e) { imWarn(e) }
      el = el.parentElement
    }
    try {
      var app = document.querySelector('#app')
      if (app && app.__vue_app__ && app.__vue_app__._instance && app.__vue_app__._instance.subTree) {
        return walkVue3GetRim(app.__vue_app__._instance.subTree, 0, new Set())
      }
    } catch (e2) {}
    return null
  }

  /** 发码用 rim：getXhsAPI 主动挂载的 window.XhsRim 优先 */
  function getActiveRim() {
    getXhsAPI()
    var fromWin = normalizeRim(window.XhsRim)
    if (fromWin) return fromWin
    var fromFc = normalizeRim(rimFromFarmerChatApp())
    if (fromFc) return fromFc
    return normalizeRim(tryResolveXhsRimFromGlobals())
  }

  async function waitForGetChatInfo(timeoutMs) {
    getXhsAPI()
    var deadline = Date.now() + (timeoutMs || 20000)
    while (Date.now() < deadline) {
      var fn = pickGetChatInfo(getActiveRim())
      if (fn) return fn
      await new Promise(function (r) {
        setTimeout(r, 300)
      })
    }
    return null
  }

  /** 全局扫描 XhsRim（不读 farmer-chat-app，避免与 getActiveRim 循环） */
  function tryResolveXhsRimFromGlobals() {
    function acceptRim(rim) {
      if (!isFullXhsRim(rim)) return null
      if (!hasSendRim(window.XhsRim)) window.XhsRim = rim
      return rim
    }
    try {
      var app = document.querySelector('#app')
      var store =
        app &&
        app.__vue_app__ &&
        app.__vue_app__._context &&
        app.__vue_app__._context.provides &&
        app.__vue_app__._context.provides.store
      if (store && store.state) {
        var im = store.state.imStore || {}
        var candidates = [im.rim, im.xhsRim, im.jarvisRim, store.state.jarvisIM, store.state.rim]
        for (var i = 0; i < candidates.length; i++) {
          var hit = acceptRim(candidates[i])
          if (hit) return hit
        }
      }
    } catch (e) { imWarn(e) }
    var names = ['XhsRim', 'xhsRim', '__XHS_RIM__', 'JarvisIM', 'jarvisIM', '__JARVIS_IM__', 'rimSdk']
    for (var n = 0; n < names.length; n++) {
      try {
        var v = window[names[n]]
        if (isFullXhsRim(v)) {
          if (!hasSendRim(window.XhsRim)) window.XhsRim = v
          return v
        }
        if (v && typeof v === 'object' && isFullXhsRim(v.rim)) {
          if (!hasSendRim(window.XhsRim)) window.XhsRim = v.rim
          return v.rim
        }
      } catch (e2) {}
    }
    var storeHits = scanStoreForRim()
    for (var si = 0; si < storeHits.length; si++) {
      var sh = acceptRim(storeHits[si].rim)
      if (sh) return sh
    }
    var iframeHits = probeIframeForRim()
    for (var ii = 0; ii < iframeHits.length; ii++) {
      var ih = acceptRim(iframeHits[ii].rim)
      if (ih) return ih
    }
    return null
  }

  function tryResolveXhsRim() {
    getXhsAPI()
    return getActiveRim()
  }

  getXhsAPI()

  // dashboard 长时间无 farmer-chat-app 时 reload（限 3 次）
  ;(function startDashboardReloadGuard() {
    if (window.__xhsDashboardReloadGuard) return
    window.__xhsDashboardReloadGuard = true
    var reloadCount = parseInt(sessionStorage.getItem('__xhsDashReloadCount') || '0', 10) || 0
    var lastReloadAt = 0
    setInterval(function () {
      try {
        getXhsAPI()
        if (window.XhsRim && window.ImLoginInfo) return
        // ★ 仅 dashboard 页面启用 reload guard；chat 页会正常渲染 farmer-chat-app，
        // 无需 reload（之前 chat 也 reload → window 重建 → 计数重置 → 无限循环，IM SDK 永远无法初始化）
        if (!/\/cstools\/seller\/dashboard/.test(location.href)) return
        if (document.querySelector('.farmer-chat-app')) {
          try {
            sessionStorage.removeItem('__xhsDashReloadCount')
          } catch (_e) {}
          return
        }
        if (reloadCount >= 3) return
        var now = Date.now()
        if (now - lastReloadAt < 20000) return
        lastReloadAt = now
        reloadCount++
        try {
          sessionStorage.setItem('__xhsDashReloadCount', String(reloadCount))
        } catch (_e) {}
        console.warn('[IMSend] farmer-chat-app 未出现，reload (' + reloadCount + '/3)')
        setTimeout(function () {
          try {
            location.reload()
          } catch (e) { imWarn(e) }
        }, 1500)
      } catch (e) { imWarn(e) }
    }, 5000)
  })()

  function buildSignHeaders(apiPath, opts) {
    opts = opts || {}
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    }
    if (opts.subsystem) headers['x-subsystem'] = opts.subsystem
    const token = getAccessToken()
    // 阿奇锁：authorization 为裸 token，不加 Bearer
    if (token) headers.authorization = token
    try {
      if (typeof window._webmsxyw === 'function') {
        const sign = window._webmsxyw(apiPath)
        if (sign && typeof sign === 'object') {
          Object.assign(headers, sign)
        } else if (typeof sign === 'string' && sign) {
          headers['X-s'] = sign
        }
      }
    } catch (e) {
      console.warn('[IMSend] _webmsxyw 签名失败', e)
    }
    return headers
  }

  async function apiGet(path) {
    const headers = buildSignHeaders(path, { subsystem: 'eva' })
    const res = await fetch('https://walle.xiaohongshu.com' + path, {
      method: 'GET',
      credentials: 'include',
      headers
    })
    return { http: res.status, json: await res.json() }
  }

  async function apiPost(path, body) {
    const headers = buildSignHeaders(path, { subsystem: 'eva' })
    const res = await fetch('https://walle.xiaohongshu.com' + path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body || {})
    })
    return { http: res.status, json: await res.json() }
  }

  function searchCustomerPath(orderSn) {
    const sellerId = getCsProviderId()
    return (
      '/api/edith/mcs/search_customer?seller_id=' +
      encodeURIComponent(sellerId || '') +
      '&keyword=' +
      encodeURIComponent(String(orderSn).trim()) +
      '&page_no=1&page_size=5&cancel_token=' +
      CANCEL_TOKEN
    )
  }

  function orderLookupKeys(orderSn) {
    var s = String(orderSn || '').trim()
    var keys = []
    function add(k) {
      k = String(k || '').trim()
      if (k && keys.indexOf(k) < 0) keys.push(k)
    }
    add(s)
    if (/^P/i.test(s)) {
      var bare = s.replace(/^P/i, '')
      add(bare)
      // packageId = P + orderId + 包裹序号（末位常为 1）
      if (/^\d+$/.test(bare) && bare.length > 1) {
        add(bare.slice(0, -1))
      }
    } else if (/^\d+$/.test(s)) {
      add('P' + s + '1')
      add('P' + s + '01')
    }
    return keys
  }

  /** 订单号 → 买家客户 ID（对标 getUserByOrderSn；优先 packageId P 前缀） */
  async function getUserByOrderSn(orderSn) {
    await waitForImLoginInfo(8000)
    const sellerId = getCsProviderId()
    if (!sellerId) {
      throw new Error('ImLoginInfo.csProviderId 未就绪，请打开客服聊天页 /cstools/chat')
    }
    const keys = orderLookupKeys(orderSn)
    var lastEmpty = null
    for (var i = 0; i < keys.length; i++) {
      const kw = keys[i]
      const path = searchCustomerPath(kw)
      const { json: data } = await apiGet(path)
      if (!data || data.success === false) {
        lastEmpty = 'search_customer 失败 keyword=' + kw + ' ' + JSON.stringify(data || {}).slice(0, 120)
        continue
      }
      const list = data?.data?.search_results || data?.data?.list || data?.data || []
      const first = Array.isArray(list) ? list[0] : null
      const buyerId = first?.id || first?.user_id || first?.customer_id || null
      if (buyerId) {
        if (kw !== String(orderSn).trim()) {
          console.log('[IMSend] search_customer 命中备用关键词', kw, '原输入', orderSn)
        }
        return buyerId
      }
      lastEmpty = 'search_customer 无结果 keyword=' + kw
    }
    if (lastEmpty) console.warn('[IMSend]', lastEmpty, 'tried=', keys.join(','))
    return null
  }

  /** 订单号 → 买家昵称（供模板 {买家昵称} 替换） */
  async function getBuyerNameByOrderSn(orderSn) {
    const keys = orderLookupKeys(orderSn)
    for (var i = 0; i < keys.length; i++) {
      const path = searchCustomerPath(keys[i])
      const { json: data } = await apiGet(path)
      const list = data?.data?.search_results || data?.data?.list || data?.data || []
      const first = Array.isArray(list) ? list[0] : null
      const name =
        first?.nickname ||
        first?.nick_name ||
        first?.user_name ||
        first?.name ||
        first?.display_name ||
        ''
      if (name) return name
    }
    return ''
  }

  /**
   * 买家 ID → chatId（对标阿奇锁 getUserByOrderSnChatId）
   * arg1/arg2 必须为对象，不能传裸 buyerId/orderSn
   */
  async function getChatId(buyerId, orderSn) {
    await waitForImLoginInfo(10000)
    var getChatInfoFn = await waitForGetChatInfo(25000)
    if (!getChatInfoFn) {
      var rim = tryResolveXhsRim()
      throw new Error(
        'XhsRim 未就绪：rimSdk.getChatInfo 不可用（sendTextMsg=' +
          hasSendRim(rim) +
          ' rimSdk=' +
          !!(rim && rim.rimSdk) +
          '）'
      )
    }
    const csId = getCsProviderId()
    if (!csId) {
      throw new Error('ImLoginInfo.csProviderId 未就绪')
    }
    getXhsAPI()
    const arg1 = {
      promoterType: 'OFFICIAL',
      invitedRefId: buyerId,
      presentUserRefId: csId,
      additionInfo: { version: CHAT_SDK_VERSION }
    }
    const arg2 = {
      receiverAppUid: '1#2#2#' + buyerId,
      creatorParentAppUid: '1#3#6#' + csId,
      bizType: 'chat'
    }
    const chatInfo = await getChatInfoFn(arg1, arg2)
    if (!chatInfo || chatInfo.success === false) {
      throw new Error(
        'getChatInfo 失败 order=' +
          (orderSn || buyerId) +
          ' resp=' +
          JSON.stringify(chatInfo || null).slice(0, 240)
      )
    }
    return chatInfo.data?.id || chatInfo.id || null
  }

  function assertSendOk(result, action) {
    if (result && result.status === 'success') return result
    throw new Error(
      (action || 'send') + ' 失败: ' + (result && (result.message || result.msg) ? result.message || result.msg : JSON.stringify(result || null))
    )
  }

  async function sendTextMsg(content, chatId) {
    var rim = getActiveRim()
    if (!rim || typeof rim.sendTextMsg !== 'function') {
      throw new Error('XhsRim.sendTextMsg 不可用')
    }
    const result = await rim.sendTextMsg(String(content), { chatId })
    return assertSendOk(result, 'sendTextMsg')
  }

  async function sendImageMsg(fileOrUrl, chatId) {
    var rim = getActiveRim()
    if (!rim || typeof rim.sendImageMsg !== 'function') {
      throw new Error('XhsRim.sendImageMsg 不可用')
    }
    if (typeof fileOrUrl === 'string' && /^https?:\/\//.test(fileOrUrl)) {
      const blob = await fetch(fileOrUrl).then(function (r) {
        return r.blob()
      })
      const f = new File([blob], 'PC-IMG-' + Date.now(), { type: blob.type || 'image/png' })
      return assertSendOk(await rim.sendImageMsg(f, { chatId }), 'sendImageMsg')
    }
    return assertSendOk(await rim.sendImageMsg(fileOrUrl, { chatId }), 'sendImageMsg')
  }

  async function sendVideoMsg(content, chatId) {
    var rim = getActiveRim()
    if (!rim || typeof rim.sendCustomMsg !== 'function') {
      throw new Error('XhsRim.sendCustomMsg 不可用')
    }
    return assertSendOk(
      await rim.sendCustomMsg({ content: content, content_type: 73 }, { chatId }),
      'sendVideoMsg'
    )
  }

  async function sendNotesMsg(content, chatId) {
    var rim = getActiveRim()
    if (!rim || typeof rim.sendCustomMsg !== 'function') {
      throw new Error('XhsRim.sendCustomMsg 不可用')
    }
    const payload = { content: content, content_type: 92 }
    const options = {
      chatId: chatId,
      manualInsertFn: function (msgObj, utils) {
        if (utils && typeof utils.appendMsg === 'function') {
          utils.appendMsg(msgObj)
        }
      }
    }
    return assertSendOk(await rim.sendCustomMsg(payload, options), 'sendNotesMsg')
  }

  /** 从 get_csa_info 响应提取 csProviderId（与 api-interceptor 对齐） */
  function extractCsProviderIdFromCsa(data) {
    if (!data || typeof data !== 'object') return ''
    function pick(v) {
      var s = String(v == null ? '' : v).trim()
      return s && s.length > 0 && s.length < 64 ? s : ''
    }
    var d = (data.data && typeof data.data === 'object') ? data.data : data
    var direct = [
      d.csProviderId, d.cs_provider_id, d.providerId, d.provider_id,
      d.user && d.user.csProviderId, d.user && d.user.cs_provider_id,
      d.csaInfo && d.csaInfo.csProviderId, d.csa_info && d.csa_info.csProviderId,
      d.seller && d.seller.csProviderId
    ]
    for (var i = 0; i < direct.length; i++) {
      var s = pick(direct[i])
      if (s) return s
    }
    try {
      var ks = Object.keys(d)
      for (var j = 0; j < ks.length; j++) {
        var val = d[ks[j]]
        if (val && typeof val === 'object') {
          var s2 = pick(val.csProviderId || val.cs_provider_id)
          if (s2) return s2
        }
      }
    } catch (e) { imWarn(e) }
    return ''
  }

  /** 把 csProviderId 写进 imStore.xUserInfo + window.ImLoginInfo（兜底，api-interceptor 也会做） */
  function patchCsProviderId(csProviderId) {
    if (!csProviderId) return false
    try {
      var app = document.querySelector('#app')
      var store = app && app.__vue_app__ && app.__vue_app__._context &&
        app.__vue_app__._context.provides && app.__vue_app__._context.provides.store
      if (store && store.state && store.state.imStore) {
        var imStore = store.state.imStore
        var next = Object.assign({}, imStore.xUserInfo || {}, { csProviderId: String(csProviderId) })
        if (imStore.xUserInfo && typeof imStore.xUserInfo === 'object') {
          try { imStore.xUserInfo.csProviderId = String(csProviderId); } catch (e) { imWarn(e) }
        } else if (typeof store.commit === 'function') {
          try { store.commit('setXUserInfo', next) } catch (e) { imWarn(e) }
          try { store.commit('SET_X_USER_INFO', next) } catch (e) { imWarn(e) }
        } else {
          try { imStore.xUserInfo = next } catch (e) { imWarn(e) }
        }
      }
    } catch (e) { imWarn(e) }
    window.ImLoginInfo = Object.assign({}, window.ImLoginInfo || {}, { csProviderId: String(csProviderId) })
    return true
  }

  /**
   * get_csa_info + XhsRim + ImLoginInfo 健康检查（阶段 A）
   */
  async function checkImHealth() {
    getXhsAPI()
    const health = {
      token: !!getAccessToken(),
      imLogin: false,
      csProviderId: '',
      rim: !!(window.XhsRim && typeof window.XhsRim.sendTextMsg === 'function'),
      xhsApiService: !!window.XhsApiService,
      farmerChatApp: !!document.querySelector('.farmer-chat-app'),
      wsReady: isWsReady(),
      wsDiag: getWsDiag(),
      csa: { ok: false, http: 0, success: false, msg: '' },
      ok: false,
      at: Date.now()
    }
    const info = await waitForImLoginInfo(3000)
    if (info && info.csProviderId) {
      health.imLogin = true
      health.csProviderId = String(info.csProviderId)
    }
    try {
      const path = '/api/edith/mcs/get_csa_info'
      const headers = buildSignHeaders(path, { subsystem: 'eva' })
      const res = await fetch('https://walle.xiaohongshu.com' + path, {
        method: 'GET',
        credentials: 'include',
        headers: headers
      })
      const data = await res.json()
      health.csa.http = res.status
      health.csa.success = data && (data.success === true || (data.code === 0 && !!data.data))
      // 关键：csa.ok 必须同时满足 HTTP 200 + 业务 success + 拿到 csProviderId，禁止假成功
      const csProviderId = health.csa.success ? extractCsProviderIdFromCsa(data) : ''
      if (csProviderId) {
        patchCsProviderId(csProviderId)
        if (!health.csProviderId) health.csProviderId = csProviderId
        if (!health.imLogin) {
          health.imLogin = true
        }
      }
      health.csa.ok = health.csa.success && !!csProviderId
      health.csa.msg = (data && (data.msg || data.message)) || (csProviderId ? '' : '响应缺 csProviderId')
    } catch (e) {
      health.csa.msg = String(e && e.message ? e.message : e)
    }
    health.wsReady = isWsReady()
    if (!health.rim) {
      var active = getActiveRim()
      health.rim = !!(active && typeof active.sendTextMsg === 'function')
    }
    health.ok = health.token && health.imLogin && health.csa.ok && (health.rim || health.wsReady)
    window.__xhsAssistant = window.__xhsAssistant || { version: '1.0.0' }
    window.__xhsAssistant.imHealth = health
    return health
  }

  async function deliverByOrderSn(orderSn, content, type) {
    type = type || 'text'
    getXhsAPI()
    const buyerId = await getUserByOrderSn(orderSn)
    if (!buyerId) {
      return { success: false, error: 'search_customer 未找到买家: ' + orderSn }
    }
    const buyerName = await getBuyerNameByOrderSn(orderSn)
    const csId = getCsProviderId()

    if (type === 'text') {
      var rim = getActiveRim()
      if (rim && typeof rim.sendTextMsg === 'function') {
        try {
          const chatId = await getChatId(buyerId, orderSn)
          if (chatId) {
            await sendTextMsg(content, chatId)
            return {
              success: true,
              buyerId: buyerId,
              buyerName: buyerName,
              chatId: chatId,
              via: 'xhs-rim',
              trackingNumber: String(content).slice(0, 80)
            }
          }
        } catch (rimErr) {
          console.warn('[XHS Assistant] XhsRim 发码失败，尝试 impaas-ws:', rimErr && rimErr.message ? rimErr.message : rimErr)
        }
      }
      try {
        const wsResult = await sendTextViaImpaasWs(content, buyerId, csId)
        return {
          success: true,
          buyerId: buyerId,
          buyerName: buyerName,
          chatId: wsResult.appCid || '',
          via: 'impaas-ws',
          trackingNumber: String(content).slice(0, 80)
        }
      } catch (wsErr) {
        var wsMsg = wsErr && wsErr.message ? wsErr.message : String(wsErr)
        console.warn('[XHS Assistant] WS 发码失败，回退 XhsRim:', wsMsg)
        if (!getActiveRim() || typeof getActiveRim().sendTextMsg !== 'function') {
          return { success: false, error: 'impaas-ws 发码失败: ' + wsMsg, buyerId: buyerId }
        }
      }
    }

    const chatId = await getChatId(buyerId, orderSn)
    if (!chatId) {
      return { success: false, error: 'getChatInfo 未返回 chatId, buyerId=' + buyerId }
    }
    if (type === 'image') {
      await sendImageMsg(content, chatId)
    } else if (type === 'video') {
      await sendVideoMsg(content, chatId)
    } else if (type === 'note' || type === 'link') {
      await sendNotesMsg(content, chatId)
    } else {
      await sendTextMsg(content, chatId)
    }
    return {
      success: true,
      buyerId: buyerId,
      buyerName: buyerName,
      chatId: chatId,
      via: 'xhs-rim',
      trackingNumber: String(content).slice(0, 80)
    }
  }

  /**
   * 拉取全量订单（对齐千帆 HAR：status:[]）
   */
  async function fetchPendingOrders(opts) {
    opts = opts || {}
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const lookbackDays = Number(opts.lookbackDays) > 0 ? Number(opts.lookbackDays) : 7
    const start = Number(opts.startTime) || now - lookbackDays * dayMs
    const end = Number(opts.endTime) || now + dayMs
    const statusList = Array.isArray(opts.status) ? opts.status : []

    const body = {
      page_no: Number(opts.pageNo) || 1,
      page_size: Number(opts.pageSize) || 50,
      order_tag_list: [],
      order_type_list: [],
      status: statusList,
      time_range_list: [{ time_type: 3, start_time: start, end_time: end }],
      seller_mark_priority_list: [],
      seller_mark_note_status_list: [],
      overdue_status: -2,
      sort_by: { sort_field: 'ordered_at', desc: true },
      need_declare_info: true,
      need_declare_times: true,
      allow_es_fallback: true
    }

    const path = '/api/edith/fulfillment/order/page'
    const hosts = []
    try {
      const host = location.hostname || ''
      if (host.includes('ark.xiaohongshu.com')) hosts.push('https://ark.xiaohongshu.com')
      if (host.includes('walle.xiaohongshu.com')) hosts.push('https://walle.xiaohongshu.com')
    } catch (e) { imWarn(e) }
    hosts.push('https://ark.xiaohongshu.com', 'https://walle.xiaohongshu.com')
    const uniqHosts = hosts.filter(function (h, i) {
      return hosts.indexOf(h) === i
    })

    let data = null
    let lastErr = ''
    let usedHost = ''
    for (let hi = 0; hi < uniqHosts.length; hi++) {
      const base = uniqHosts[hi]
      const isArk = /ark\.xiaohongshu\.com/i.test(base)
      const headers = buildSignHeaders(path, { subsystem: isArk ? '' : 'eva' })
      try {
        const res = await fetch(base + path, {
          method: 'POST',
          credentials: 'include',
          headers: headers,
          body: JSON.stringify(body)
        })
        const json = await res.json()
        data = json
        usedHost = base
        if (json && (json.success === true || json.code === 0 || (json.data && Array.isArray(json.data.packages)))) {
          break
        }
        lastErr =
          'host=' +
          base +
          ' http=' +
          res.status +
          ' code=' +
          (json && json.code) +
          ' msg=' +
          (json && (json.msg || json.message))
      } catch (e) {
        lastErr = 'host=' + base + ' ' + String(e && e.message ? e.message : e)
      }
    }

    if (!data) {
      return { __error: lastErr || 'fulfillment/order/page 无响应', orders: [] }
    }
    if (data.success === false && data.code !== 0) {
      return {
        __error:
          'fulfillment/order/page 失败: code=' +
          data.code +
          ' msg=' +
          (data.msg || data.message || '') +
          ' host=' +
          usedHost,
        orders: []
      }
    }

    const packages =
      (data.data && (data.data.packages || data.data.orders || data.data.package_list || data.data.list)) ||
      []

    const orders = []
    for (const row of Array.isArray(packages) ? packages : []) {
      const packageId = row.packageId || row.package_id || ''
      const orderSn =
        packageId ||
        row.orderId ||
        row.order_id ||
        row.orderSn ||
        row.order_sn ||
        row.id ||
        ''
      const sku = (row.skus && row.skus[0]) || null
      const productId =
        (sku && (sku.itemId || sku.item_id || sku.goodsId || sku.goods_id)) ||
        row.itemId ||
        row.item_id ||
        ''
      const statusText =
        row.statusDesc || row.status_desc || row.status_name || row.status || ''
      const statusCode = Number(row.status)
      const tags = row.orderTagList || row.order_tag_list || []
      const isVirtual =
        (Array.isArray(tags) &&
          tags.some(function (t) {
            return /NO_LOGISTICS|AUTO_DELIVERY|ONLY_SUPPORT_NO_LOGISTICS/i.test(String(t))
          })) ||
        false

      const orderTime =
        row.paidAt ||
        row.paid_at ||
        row.orderedAt ||
        row.ordered_at ||
        row.createdAt ||
        row.created_at ||
        row.create_time ||
        row.createTime ||
        row.order_time ||
        row.orderTime ||
        row.pay_time ||
        row.payTime ||
        row.gmt_create ||
        row.gmtCreate ||
        ''
      if (orderSn) {
        orders.push({
          order_id: String(orderSn),
          package_id: String(packageId || orderSn),
          product_id: String(productId || ''),
          status: String(statusText),
          status_code: Number.isFinite(statusCode) ? statusCode : null,
          order_time: String(orderTime || ''),
          is_virtual: isVirtual,
          source: 'fulfillment_api',
          host: usedHost
        })
      }
    }
    return orders
  }

  /**
   * 对标阿奇锁历史版 window.sendImTextMsg(base64, orderId)
   * 主进程 executeJavaScript 直调入口；返回 ''=成功，非空=错误消息
   */
  function decodeBase64Utf8(b64) {
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf-8')
      return decodeURIComponent(escape(atob(b64)))
    } catch (e) {
      return atob(b64)
    }
  }

  function encodeUtf8Base64(text) {
    try {
      if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf-8').toString('base64')
      return btoa(unescape(encodeURIComponent(text)))
    } catch (e) {
      return btoa(text)
    }
  }

  window.sendImTextMsg = async function sendImTextMsg(contentBase64, orderId) {
    var step = { stepNum: 0, stepData: '' }
    try {
      getXhsAPI()
      if (!window.XhsRim || typeof window.XhsRim.sendTextMsg !== 'function') {
        getXhsAPI()
        return '页面加载中'
      }
      step.stepNum = 1
      step.stepData = String(orderId)
      var buyerId = await getUserByOrderSn(orderId)
      if (!buyerId) {
        return '根据订单号获取不到买家信息'
      }
      var sellerInfo = readImLoginInfo()
      if (!sellerInfo || !sellerInfo.csProviderId) {
        return 'ImLoginInfo.csProviderId 未就绪'
      }
      step.stepNum = 2
      var arg1 = {
        promoterType: 'OFFICIAL',
        invitedRefId: buyerId,
        presentUserRefId: sellerInfo.csProviderId,
        additionInfo: { version: CHAT_SDK_VERSION }
      }
      var arg2 = {
        receiverAppUid: '1#2#2#' + buyerId,
        creatorParentAppUid: '1#3#6#' + sellerInfo.csProviderId,
        bizType: 'chat'
      }
      step.stepData = JSON.stringify(arg1) + ',' + JSON.stringify(arg2)
      var getChatInfoFn = pickGetChatInfo(window.XhsRim)
      if (!getChatInfoFn) {
        return 'XhsRim.rimSdk.getChatInfo 不可用'
      }
      var chatInfo = await getChatInfoFn(arg1, arg2)
      if (!chatInfo || chatInfo.success === false) {
        return '创建会话失败'
      }
      var chatId = chatInfo.data && chatInfo.data.id ? chatInfo.data.id : chatInfo.id
      if (!chatId) {
        return '获取不到对话Id'
      }
      step.stepNum = 3
      step.stepData = String(chatId)
      var content = decodeBase64Utf8(contentBase64)
      var sendTextMsgResult = await window.XhsRim.sendTextMsg(content, { chatId: chatId })
      if (!sendTextMsgResult || sendTextMsgResult.status !== 'success') {
        return '发送IM文本消息返回失败' + (sendTextMsgResult && sendTextMsgResult.message ? sendTextMsgResult.message : '')
      }
      return ''
    } catch (error) {
      var errorMsg =
        error && error.message
          ? error.message
          : error && error.axiosInfo
            ? JSON.stringify(error.axiosInfo)
            : String(error)
      console.warn(
        '[IMSend] sendImTextMsg异常 order=' +
          orderId +
          ' step=' +
          step.stepNum +
          ' err=' +
          errorMsg
      )
      if (error && error.axiosInfo && error.axiosInfo.code === 401) {
        goReLogin()
        return '页面加载中'
      }
      return '发送Im文本消息处理异常！：' + errorMsg
    }
  }

  window.__xhsAssistant = window.__xhsAssistant || { version: '1.0.0' }
  window.__xhsAssistant.im = {
    readImLoginInfo: readImLoginInfo,
    waitForImLoginInfo: waitForImLoginInfo,
    getCsProviderId: getCsProviderId,
    getUserByOrderSn: getUserByOrderSn,
    getBuyerNameByOrderSn: getBuyerNameByOrderSn,
    getChatId: getChatId,
    sendTextMsg: sendTextMsg,
    sendImageMsg: sendImageMsg,
    sendVideoMsg: sendVideoMsg,
    sendNotesMsg: sendNotesMsg,
    deliverByOrderSn: deliverByOrderSn,
    fetchPendingOrders: fetchPendingOrders,
    checkImHealth: checkImHealth,
    buildAppCid: buildAppCid,
    sendTextViaImpaasWs: sendTextViaImpaasWs,
    isWsReady: isWsReady,
    ensureZeldaWs: ensureZeldaWs,
    connectAssistantZeldaWs: connectAssistantZeldaWs,
    getWsDiag: getWsDiag,
    getZeldaWs: getZeldaWs,
    getXhsAPI: getXhsAPI,
    getImAppVue: getImAppVue,
    tryResolveXhsRim: tryResolveXhsRim,
    getActiveRim: getActiveRim,
    deepProbeRim: deepProbeRim,
    tryNudgeImSdkInit: tryNudgeImSdkInit,
    goReLogin: goReLogin,
    checkXhsTicketExpired: checkXhsTicketExpired,
    sendImTextMsg: window.sendImTextMsg,
    encodeUtf8Base64: encodeUtf8Base64,
    hasXhsRim: function () {
      getXhsAPI()
      var rim = getActiveRim()
      return !!(rim && typeof rim.sendTextMsg === 'function')
    }
  }

  getXhsAPI()
  startCheckXhsTicketExpired()
  console.log('[XHS Assistant] IMSend agiso-v4-deepRim 已注入, XhsRim=', window.__xhsAssistant.im.hasXhsRim(), 'wsReady=', isWsReady())
})()
