/**
 * 1:1 对标阿奇索历史版 xhsImPreload.ts（Electron 1.2.13）
 * - window.csBridge = installCsBridge()
 * - window.electron = { ipcRenderer: basePreload }
 * - window.sendImTextMsg(base64, orderId)
 * - getXhsAPI() 主动 .farmer-chat-app.__vue__.getRim()
 */
import { ipcRenderer } from 'electron'
import { join } from 'path'
import basePreload from './im-base-preload'
import { installCsBridge } from './cs-bridge-shim'

const XHS_IM_LOGIN_URL = 'https://walle.xiaohongshu.com/cstools/login'

type ExecStep = { stepNum?: number; stepData?: string }

type FarmerVue = {
  getRim?: () => XhsRimLike
  userInfo?: { csProviderId?: string }
  $parent?: { services?: unknown; version?: string }
  $router?: unknown
}

type XhsRimLike = {
  sendTextMsg?: (content: string, opts: { chatId: string }) => Promise<{ status?: string; message?: string }>
  rimSdk?: { getChatInfo?: (a1: unknown, a2: unknown) => Promise<{ success?: boolean; data?: { id?: string } }> }
}

declare global {
  interface Window {
    electron: { ipcRenderer: typeof basePreload }
    csBridge: ReturnType<typeof installCsBridge> extends void ? Record<string, unknown> : never
    sendImTextMsg: (contentBase64: string, orderId: string) => Promise<string>
    XhsRim?: XhsRimLike
    ImLoginInfo?: { csProviderId?: string }
    XhsApiService?: unknown
    VueRouter?: unknown
    _webmsxyw?: (path: string) => Record<string, string>
  }
}

window.electron = { ipcRenderer: basePreload }
installCsBridge()
try {
  const w = window as Window & { csBridge?: { appInfo?: { injectJsPath?: string } } }
  if (w.csBridge?.appInfo) {
    w.csBridge.appInfo.injectJsPath = join(__dirname, 'xhs-im-preload.js')
  }
} catch {
  /* ignore */
}

// ★ 在页面 JS 之前安装 WebSocket hook（preload 先于页面脚本执行）
// 捕获小红书 IM SDK 创建的 zelda WS，供 im-send.js 的 deliverByOrderSn WS 直发使用。
// Electron 30 不暴露 Vue 实例属性（__vue__/__vueParentComponent），XhsRim 无法通过 DOM 获取，
// 因此 WS 直发是发消息的主要路径。
;(function installEarlyWsHook() {
  const g = window as unknown as { __xhsImWsState?: typeof _wsState }
  if (g.__xhsImWsState) return // 已安装
  const _wsState = {
    installed: true,
    zeldaSockets: [] as WebSocket[],
    lastSeq: 0,
    pendingAcks: {} as Record<string, unknown>,
  }
  g.__xhsImWsState = _wsState

  const OrigWS = window.WebSocket
  if (!OrigWS || !OrigWS.prototype) return
  const origSend = OrigWS.prototype.send
  const origAdd = OrigWS.prototype.addEventListener

  function registerZeldaSocket(ws: WebSocket) {
    if (!ws || (ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked) return
    const url = ws.url || ''
    if (!/zelda\.xiaohongshu\.com/i.test(url)) return
    ;(ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked = true
    _wsState.zeldaSockets.push(ws)
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}')
        if (msg && msg.header && typeof msg.header.seq === 'number') {
          _wsState.lastSeq = Math.max(_wsState.lastSeq, msg.header.seq)
        }
      } catch {
        /* ignore */
      }
    })
    ws.addEventListener('close', () => {
      const idx = _wsState.zeldaSockets.indexOf(ws)
      if (idx >= 0) _wsState.zeldaSockets.splice(idx, 1)
    })
  }

  OrigWS.prototype.send = function (data: string) {
    registerZeldaSocket(this)
    try {
      const parsed = JSON.parse(typeof data === 'string' ? data : '{}')
      if (parsed && parsed.header && typeof parsed.header.seq === 'number') {
        _wsState.lastSeq = Math.max(_wsState.lastSeq, parsed.header.seq)
      }
    } catch {
      /* ignore */
    }
    return origSend.call(this, data)
  } as typeof OrigWS.prototype.send

  OrigWS.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    registerZeldaSocket(this)
    return origAdd.call(this, type, listener, options)
  } as typeof OrigWS.prototype.addEventListener

  function HookedWebSocket(url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url)
    registerZeldaSocket(ws)
    return ws
  }
  HookedWebSocket.prototype = OrigWS.prototype
  ;(['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const).forEach((k) => {
    try {
      ;(HookedWebSocket as unknown as Record<string, unknown>)[k] = (OrigWS as unknown as Record<string, unknown>)[k]
    } catch {
      /* ignore */
    }
  })
  window.WebSocket = HookedWebSocket as unknown as typeof WebSocket
  console.log('[xhs-im-preload] WebSocket hook 已安装（preload 早期）')

  // ★ 启用 Vue3 devtools：注册 __VUE_INSTANCE_SETTERS__ 回调，让 Vue3 在 DOM 上设置 __vueParentComponent
  // Electron 30 不自动安装 Vue devtools，导致 .farmer-chat-app.__vue__ / __vueParentComponent 不存在，
  // XhsRim 无法通过 Jl() 的 DOM 遍历获取。
  ;(function enableVue3Devtools() {
    const w = window as unknown as {
      __VUE_INSTANCE_SETTERS__?: ((vnode: unknown) => void)[]
      __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown
    }
    if (!w.__VUE_INSTANCE_SETTERS__) {
      w.__VUE_INSTANCE_SETTERS__ = []
    }
    // 注册回调：当 Vue3 创建组件实例时，在 DOM 元素上设置 __vueParentComponent
    const setter = (instance: unknown) => {
      try {
        const inst = instance as {
          vnode?: { el?: Element }
          proxy?: { $el?: Element }
          subTree?: { el?: Element }
        }
        const el = inst.vnode?.el || inst.proxy?.$el || inst.subTree?.el
        if (el && el instanceof Element) {
          ;(el as unknown as { __vueParentComponent?: unknown }).__vueParentComponent = instance
        }
      } catch {
        /* ignore */
      }
    }
    if (!w.__VUE_INSTANCE_SETTERS__.includes(setter)) {
      w.__VUE_INSTANCE_SETTERS__.push(setter)
    }
    console.log('[xhs-im-preload] Vue3 devtools setter 已注册')
  })()

  // ★ 监听 iframe 创建，将 WS hook 注入到子 frame（特别是 mio-chat iframe）
  // IM SDK 的 WS 可能在 mio-chat iframe 内创建，主窗口的 hook 无法拦截子 frame 的 WebSocket
  function injectWsHookIntoIframe(win: Window) {
    try {
      const w = win as unknown as { __xhsImWsState?: typeof _wsState }
      if (w.__xhsImWsState) return
      const iframeState = {
        installed: true,
        zeldaSockets: [] as WebSocket[],
        lastSeq: 0,
        pendingAcks: {} as Record<string, unknown>,
      }
      w.__xhsImWsState = iframeState

      const OrigWS = win.WebSocket
      if (!OrigWS || !OrigWS.prototype) return
      const origSend = OrigWS.prototype.send

      function registerZelda(ws: WebSocket) {
        if (!ws || (ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked) return
        const url = ws.url || ''
        if (!/zelda\.xiaohongshu\.com/i.test(url)) return
        ;(ws as unknown as { __xhsZeldaTracked?: boolean }).__xhsZeldaTracked = true
        iframeState.zeldaSockets.push(ws)
        ws.addEventListener('message', (ev: MessageEvent) => {
          try {
            const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '{}')
            if (msg && msg.header && typeof msg.header.seq === 'number') {
              iframeState.lastSeq = Math.max(iframeState.lastSeq, msg.header.seq)
              _wsState.lastSeq = Math.max(_wsState.lastSeq, msg.header.seq)
            }
          } catch {
            /* ignore */
          }
        })
        ws.addEventListener('close', () => {
          const idx = iframeState.zeldaSockets.indexOf(ws)
          if (idx >= 0) iframeState.zeldaSockets.splice(idx, 1)
        })
      }

      OrigWS.prototype.send = function (data: string) {
        registerZelda(this)
        try {
          const parsed = JSON.parse(typeof data === 'string' ? data : '{}')
          if (parsed && parsed.header && typeof parsed.header.seq === 'number') {
            iframeState.lastSeq = Math.max(iframeState.lastSeq, parsed.header.seq)
            _wsState.lastSeq = Math.max(_wsState.lastSeq, parsed.header.seq)
          }
        } catch {
          /* ignore */
        }
        return origSend.call(this, data)
      } as typeof OrigWS.prototype.send

      function HookedWS(url: string | URL, protocols?: string | string[]) {
        const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url)
        registerZelda(ws)
        return ws
      }
      HookedWS.prototype = OrigWS.prototype
      win.WebSocket = HookedWS as unknown as typeof WebSocket

      // ★ 也在子 frame 中注册 Vue3 devtools setter
      const fw = win as unknown as { __VUE_INSTANCE_SETTERS__?: ((vnode: unknown) => void)[] }
      if (!fw.__VUE_INSTANCE_SETTERS__) {
        fw.__VUE_INSTANCE_SETTERS__ = []
      }
      const iframeSetter = (instance: unknown) => {
        try {
          const inst = instance as {
            vnode?: { el?: Element }
            proxy?: { $el?: Element }
            subTree?: { el?: Element }
          }
          const el = inst.vnode?.el || inst.proxy?.$el || inst.subTree?.el
          if (el && el instanceof Element) {
            ;(el as unknown as { __vueParentComponent?: unknown }).__vueParentComponent = instance
          }
        } catch {
          /* ignore */
        }
      }
      if (!fw.__VUE_INSTANCE_SETTERS__.includes(iframeSetter)) {
        fw.__VUE_INSTANCE_SETTERS__.push(iframeSetter)
      }

      console.log('[xhs-im-preload] WS hook + Vue3 setter 已注入子 frame: ' + win.location.href.substring(0, 80))
    } catch {
      /* ignore (cross-origin) */
    }
  }

  // DOMContentLoaded 后遍历 iframe
  window.addEventListener('DOMContentLoaded', () => {
    function scanIframes() {
      const iframes = document.querySelectorAll('iframe')
      for (let i = 0; i < iframes.length; i++) {
        try {
          const win = iframes[i].contentWindow
          if (win) injectWsHookIntoIframe(win)
        } catch {
          /* cross-origin */
        }
      }
    }
    scanIframes()
    // 持续扫描（iframe 可能延迟加载）
    const observer = new MutationObserver(() => scanIframes())
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(scanIframes, 2000)
    setTimeout(scanIframes, 5000)
  })
})()

let chatSdkVersion = 'v0.0.5'

const goReLogin = () => {
  setTimeout(() => {
    if (window.location.href !== XHS_IM_LOGIN_URL) {
      window.location.href = XHS_IM_LOGIN_URL
    }
  }, 200)
}

async function getBuyerIdByOrderId(orderId: string): Promise<string | null> {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      basePreload.log(`小红书accessToken为空！【getBuyerIdByOrderId】【${orderId}】`)
      return null
    }
    const sellerId = window.ImLoginInfo?.csProviderId
    if (!sellerId) {
      basePreload.log(`小红书商家Id为空！【getBuyerIdByOrderId】【${orderId}】`)
      return null
    }
    const apiPath = `/api/edith/mcs/search_customer?seller_id=${sellerId}&keyword=${orderId.trim()}&page_no=1&page_size=5&cancel_token=%7B%22promise%22:%7B%7D%7D`
    const url = 'https://walle.xiaohongshu.com' + apiPath
    const sign = typeof window._webmsxyw === 'function' ? window._webmsxyw(apiPath) : {}
    const response = await fetch(url, {
      method: 'get',
      headers: {
        accept: 'application/json, text/plain, */*',
        'x-subsystem': 'eva',
        ...sign,
        authorization: token,
      },
    })
    const packages = await response.json()
    if (!packages?.success) {
      basePreload.log(`search_customer 异常 ${JSON.stringify(packages || {})}`)
      return null
    }
    const id = packages.data?.search_results?.[0]?.id
    return id ? String(id) : null
  } catch (error) {
    basePreload.log(`getBuyerIdByOrderId 异常：${error}`)
    return null
  }
}

/** 历史版 1:1 getXhsAPI + Vue3 深探兜底（walle 已升级 Vue3） */
function getXhsAPI() {
  if ((window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> }).__xhsGetXhsApiInterval) {
    return
  }
  ;(window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> }).__xhsGetXhsApiInterval =
    setInterval(() => {
      try {
        if (window.XhsRim && window.ImLoginInfo) {
          const id = (window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> })
            .__xhsGetXhsApiInterval
          if (id) clearInterval(id)
          ;(window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> }).__xhsGetXhsApiInterval =
            undefined
          return
        }

        // ★ 历史版 1:1：Vue2 __vue__.getRim()
        const fc = document.querySelector('.farmer-chat-app') as HTMLElement & { __vue__?: FarmerVue }
        const imAppVue = fc?.__vue__
        let rim = imAppVue?.getRim?.()
        let imLoginInfo = imAppVue?.userInfo
        let xhsApiService = imAppVue?.$parent?.services

        // Vue3 兜底：__vueParentComponent / 深探
        if (!rim) {
          const ctx = resolveVue3Rim()
          if (ctx) {
            rim = ctx.rim
            imLoginInfo = ctx.imLoginInfo || imLoginInfo
            xhsApiService = ctx.xhsApiService || xhsApiService
            if (ctx.version) chatSdkVersion = ctx.version
          }
        }

        if (!rim || !xhsApiService || !imLoginInfo) return

        const id = (window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> }).__xhsGetXhsApiInterval
        if (id) clearInterval(id)
        ;(window as unknown as { __xhsGetXhsApiInterval?: ReturnType<typeof setInterval> }).__xhsGetXhsApiInterval =
          undefined

        if (imAppVue?.$parent?.version) chatSdkVersion = imAppVue.$parent.version
        if (imAppVue?.$router) window.VueRouter = imAppVue.$router
        window.XhsRim = rim
        window.XhsApiService = xhsApiService
        window.ImLoginInfo = imLoginInfo
        console.log('[xhs-im-preload] getXhsAPI OK csProviderId=' + (imLoginInfo.csProviderId || ''))
      } catch (e) {
        console.warn('[xhs-im-preload] getXhsAPI err', e)
      }
    }, 500)
}

function resolveVue3Rim(): {
  rim: XhsRimLike
  imLoginInfo?: { csProviderId?: string }
  xhsApiService?: unknown
  version?: string
} | null {
  const fc = document.querySelector('.farmer-chat-app')
  if (fc) {
    let el: Element | null = fc
    for (let d = 0; d < 12 && el; d++) {
      const vpc = (el as HTMLElement & { __vueParentComponent?: { proxy?: FarmerVue; exposed?: FarmerVue; setupState?: FarmerVue; ctx?: FarmerVue } })
        .__vueParentComponent
      if (vpc) {
        for (const t of [vpc.proxy, vpc.exposed, vpc.setupState, vpc.ctx]) {
          const r = t?.getRim?.()
          if (r) {
            return {
              rim: r,
              imLoginInfo: t?.userInfo || readImLoginFromStore(),
              xhsApiService: (t as FarmerVue)?.$parent?.services,
              version: (t as FarmerVue)?.$parent?.version,
            }
          }
        }
      }
      el = el.parentElement
    }
  }
  const app = document.querySelector('#app') as HTMLElement & {
    __vue_app__?: { _instance?: { subTree?: unknown } }
  }
  const sub = app?.__vue_app__?._instance?.subTree
  if (sub) {
    const r = walkVue3(sub, 0, new Set())
    if (r) {
      return {
        rim: r,
        imLoginInfo: readImLoginFromStore(),
        xhsApiService: window.XhsApiService,
      }
    }
  }
  return null
}

function walkVue3(vnode: unknown, depth: number, seen: Set<unknown>): XhsRimLike | null {
  if (!vnode || depth > 32 || typeof vnode !== 'object') return null
  const v = vnode as {
    component?: {
      uid?: number
      proxy?: FarmerVue
      exposed?: FarmerVue
      setupState?: FarmerVue
      ctx?: FarmerVue
      subTree?: unknown
    }
    children?: unknown[]
  }
  const key = v.component?.uid ?? vnode
  if (seen.has(key)) return null
  seen.add(key)
  if (v.component) {
    for (const t of [v.component.proxy, v.component.exposed, v.component.setupState, v.component.ctx]) {
      const r = t?.getRim?.()
      if (r) return r
    }
    const sub = v.component.subTree
    if (sub) {
      const h = walkVue3(sub, depth + 1, seen)
      if (h) return h
    }
  }
  if (Array.isArray(v.children)) {
    for (const ch of v.children) {
      if (ch && typeof ch === 'object') {
        const h = walkVue3(ch, depth + 1, seen)
        if (h) return h
      }
    }
  }
  return null
}

function readImLoginFromStore(): { csProviderId?: string } | undefined {
  try {
    const app = document.querySelector('#app') as HTMLElement & {
      __vue_app__?: { _context?: { provides?: { store?: { state?: { imStore?: { xUserInfo?: { csProviderId?: string } } } } } } }
    }
    const info = app?.__vue_app__?._context?.provides?.store?.state?.imStore?.xUserInfo
    if (info?.csProviderId) return info
  } catch {
    /* ignore */
  }
  return window.ImLoginInfo
}

function initPage() {
  const hide = (sel: string) => {
    const timer = setInterval(() => {
      const ele = document.querySelector<HTMLElement>(sel)
      if (ele) {
        ele.style.display = 'none'
        clearInterval(timer)
      }
    }, 500)
  }
  hide('.window-opt-comp')
  const interval = setInterval(() => {
    const optItems = document.querySelectorAll('.opt-item')
    if (optItems.length > 0) {
      optItems.forEach((optItem) => {
        if (optItem.textContent?.trim() !== '设置') {
          ;(optItem as HTMLElement).style.display = 'none'
        }
      })
      clearInterval(interval)
    }
  }, 500)
}

function handleRouteChange() {
  if (window.location.href.startsWith(XHS_IM_LOGIN_URL)) {
    return
  }
  initPage()
  getXhsAPI()
}

// ★ 1:1 历史版 sendImTextMsg
window.sendImTextMsg = async (contentBase64: string, orderId: string): Promise<string> => {
  const step: ExecStep = {}
  try {
    if (!window.XhsRim) {
      getXhsAPI()
      basePreload.log(`${orderId}发送IM文本消息失败！：IM未初始化完成`)
      return '页面加载中'
    }

    step.stepNum = 1
    step.stepData = orderId
    const buyerId = await getBuyerIdByOrderId(orderId)
    if (!buyerId) {
      return '根据订单号获取不到买家信息'
    }

    const sellerInfo = window.ImLoginInfo
    if (!sellerInfo?.csProviderId) {
      return 'ImLoginInfo.csProviderId 未就绪'
    }

    step.stepNum = 2
    const arg1 = {
      promoterType: 'OFFICIAL',
      invitedRefId: buyerId,
      presentUserRefId: sellerInfo.csProviderId,
      additionInfo: { version: chatSdkVersion },
    }
    const arg2 = {
      receiverAppUid: `1#2#2#${buyerId}`,
      creatorParentAppUid: `1#3#6#${sellerInfo.csProviderId}`,
      bizType: 'chat',
    }
    step.stepData = `${JSON.stringify(arg1)},${JSON.stringify(arg2)}`

    let chatId: string | undefined
    try {
      const chatInfo = await window.XhsRim!.rimSdk!.getChatInfo!(arg1, arg2)
      if (!chatInfo?.success) {
        return '创建会话失败'
      }
      chatId = chatInfo.data?.id
    } catch (error: unknown) {
      const ax = error as { axiosInfo?: { code?: number } }
      if (ax?.axiosInfo?.code === 401) {
        goReLogin()
        return '页面加载中'
      }
      throw error
    }

    if (!chatId) {
      return '获取不到对话Id'
    }

    step.stepNum = 3
    step.stepData = chatId
    const content = Buffer.from(contentBase64, 'base64').toString('utf-8')
    const sendTextMsgResult = await window.XhsRim!.sendTextMsg!(content, { chatId })

    if (sendTextMsgResult?.status !== 'success') {
      return `发送IM文本消息返回失败${sendTextMsgResult?.message || ''}`
    }
    return ''
  } catch (error: unknown) {
    const err = error as { message?: string; axiosInfo?: unknown }
    let errorMsg = err.message || (err.axiosInfo ? JSON.stringify(err.axiosInfo) : String(error))
    basePreload.log(
      `【${orderId}】发送IM文本消息处理异常！步骤：${step.stepNum} 参数：${step.stepData} 错误：${errorMsg}`
    )
    return `发送Im文本消息处理异常！：${errorMsg}`
  }
}

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('on:xhsImLoaded')
  console.log('[xhs-im-preload] DOMContentLoaded', window.location.href)
  handleRouteChange()
})

ipcRenderer.on('on:inPageNavigated', () => {
  handleRouteChange()
})

getXhsAPI()
