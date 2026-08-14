/**
 * 在页面脚本运行前 hook zelda WebSocket（BrowserView contextIsolation=false）
 * 与 resources/inject-scripts/im-send.js 共享 window.__xhsImWsState
 */
export type ImWsState = {
  installed: boolean
  zeldaSockets: WebSocket[]
  lastSeq: number
  pendingAcks: Record<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >
}

function parseWsJson(data: unknown) {
  try {
    return typeof data === 'string' ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export function installImpaasWsHook(): void {
  if (typeof window === 'undefined') return
  const root = window.top || window
  const w = root as Window & { __xhsImWsState?: ImWsState }
  const state: ImWsState = w.__xhsImWsState || {
    installed: false,
    zeldaSockets: [],
    lastSeq: 0,
    pendingAcks: {}
  }
  w.__xhsImWsState = state
  ;(window as Window & { __xhsImWsState?: ImWsState }).__xhsImWsState = state
  if (state.installed) return
  state.installed = true

  type WsRoot = Window & { WebSocket: typeof WebSocket; __xhsImWsState?: ImWsState }
  const wsRoot = root as unknown as WsRoot
  const OrigWS = wsRoot.WebSocket
  if (!OrigWS?.prototype) return

  function trackSeq(payload: { header?: { seq?: number } } | null) {
    const seq = payload?.header?.seq
    if (typeof seq === 'number') {
      state.lastSeq = Math.max(state.lastSeq, seq)
    }
  }

  function handleWsMessage(data: unknown) {
    const msg = parseWsJson(data) as {
      header?: { type?: number; action?: string; traceId?: string; seq?: number }
      body?: { code?: number; msg?: string }
    } | null
    if (!msg?.header) return
    trackSeq(msg)
    const hdr = msg.header
    if (hdr.type === 131 && hdr.action === '/message/send' && hdr.traceId) {
      const pending = state.pendingAcks[hdr.traceId]
      if (pending) {
        delete state.pendingAcks[hdr.traceId]
        clearTimeout(pending.timer)
        const body = msg.body || {}
        if (body.code === 0) pending.resolve(body)
        else pending.reject(new Error(`${body.msg || 'send failed'} code=${body.code}`))
      }
    }
  }

  function registerZeldaSocket(ws: WebSocket) {
    const tagged = ws as WebSocket & { __xhsZeldaTracked?: boolean }
    if (tagged.__xhsZeldaTracked) return
    const url = ws.url || ''
    if (!/zelda\.xiaohongshu\.com/i.test(url)) return
    tagged.__xhsZeldaTracked = true
    state.zeldaSockets.push(ws)
    ws.addEventListener('message', (ev) => handleWsMessage(ev.data))
  }

  const origSend = OrigWS.prototype.send
  OrigWS.prototype.send = function (this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    registerZeldaSocket(this)
    const parsed = parseWsJson(data)
    if (parsed) trackSeq(parsed)
    return origSend.call(this, data)
  }

  const origAdd = OrigWS.prototype.addEventListener
  OrigWS.prototype.addEventListener = function (
    this: WebSocket,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    registerZeldaSocket(this)
    if (type === 'message' && typeof listener === 'function') {
      const self = this
      const wrapped = (ev: Event) => {
        handleWsMessage((ev as MessageEvent).data)
        return listener.call(self, ev)
      }
      return origAdd.call(this, type, wrapped, options)
    }
    if (listener == null) {
      return origAdd.call(this, type, listener as unknown as EventListener, options)
    }
    return origAdd.call(this, type, listener, options)
  }

  function HookedWebSocket(this: unknown, url: string | URL, protocols?: string | string[]) {
    const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url)
    registerZeldaSocket(ws)
    return ws
  }
  HookedWebSocket.prototype = OrigWS.prototype
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) {
    try {
      ;(HookedWebSocket as unknown as Record<string, number>)[k] = OrigWS[k]
    } catch {
      /* ignore */
    }
  }
  wsRoot.WebSocket = HookedWebSocket as unknown as typeof WebSocket
  if (root !== window) {
    try {
      window.WebSocket = HookedWebSocket as unknown as typeof WebSocket
    } catch {
      /* ignore */
    }
  }
}
