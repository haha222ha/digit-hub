/**

 * 对标阿奇锁历史版 getXhsAPI()：主动 getRim() 挂载 window.XhsRim（Vue2 + Vue3 深探）

 */

type RimLike = {

  sendTextMsg?: (...args: unknown[]) => unknown

  rimSdk?: { getChatInfo?: (...args: unknown[]) => unknown }

}



type FarmerVue = {

  getRim?: () => RimLike

  userInfo?: { csProviderId?: string }

  $parent?: { services?: unknown; version?: string }

  $router?: unknown

}



function isFullRim(rim: RimLike | null | undefined): boolean {

  return !!(

    rim &&

    typeof rim.sendTextMsg === 'function' &&

    rim.rimSdk &&

    typeof rim.rimSdk.getChatInfo === 'function'

  )

}



function rimFromVue3Target(t: Record<string, unknown> | null | undefined): RimLike | null {

  if (!t || typeof t !== 'object') return null

  try {

    const getRim = t.getRim

    if (typeof getRim === 'function') {

      const r = (getRim as () => RimLike)()

      if (r) return r

    }

    const rim = t.rim as RimLike | undefined

    if (rim && typeof rim.sendTextMsg === 'function') return rim

  } catch {

    /* ignore */

  }

  return null

}



function walkVue3GetRim(

  vnode: { component?: { uid?: number; proxy?: unknown; exposed?: unknown; setupState?: unknown; ctx?: unknown; data?: unknown; props?: unknown; subTree?: unknown; suspense?: { activeBranch?: unknown } }; suspense?: { activeBranch?: unknown }; children?: unknown[] } | null | undefined,

  depth: number,

  seen: Set<unknown>

): RimLike | null {

  if (!vnode || depth > 32) return null

  const key = (vnode.component && vnode.component.uid) || vnode

  if (seen.has(key)) return null

  seen.add(key)

  try {

    const comp = vnode.component

    if (comp) {

      const targets = [comp.proxy, comp.exposed, comp.setupState, comp.ctx, comp.data, comp.props]

      for (const t of targets) {

        const hit = rimFromVue3Target(t as Record<string, unknown>)

        if (hit) return hit

      }

    }

  } catch {

    /* ignore */

  }

  const sub = vnode.component?.subTree as typeof vnode | undefined

  if (sub) {

    const h1 = walkVue3GetRim(sub, depth + 1, seen)

    if (h1) return h1

  }

  const susp = (vnode.suspense?.activeBranch || vnode.component?.suspense?.activeBranch) as typeof vnode | undefined

  if (susp) {

    const hSusp = walkVue3GetRim(susp, depth + 1, seen)

    if (hSusp) return hSusp

  }

  if (Array.isArray(vnode.children)) {

    for (const ch of vnode.children) {

      if (ch && typeof ch === 'object') {

        const h2 = walkVue3GetRim(ch as typeof vnode, depth + 1, seen)

        if (h2) return h2

      }

    }

  }

  return null

}



function resolveFarmerImContext(): {

  rim: RimLike

  imLoginInfo?: FarmerVue['userInfo']

  xhsApiService?: unknown

  version?: string

  router?: unknown

} | null {

  const fc = document.querySelector('.farmer-chat-app') as HTMLElement & {

    __vue__?: FarmerVue

    __vueParentComponent?: { proxy?: FarmerVue }

  }

  if (!fc) return null



  let el: HTMLElement | null = fc

  for (let depth = 0; depth < 12 && el; depth++) {

    try {

      const vue2 = (el as HTMLElement & { __vue__?: FarmerVue }).__vue__

      if (vue2 && typeof vue2.getRim === 'function') {

        const rim = vue2.getRim?.()

        if (rim) {

          return {

            rim,

            imLoginInfo: vue2.userInfo,

            xhsApiService: vue2.$parent?.services,

            version: vue2.$parent?.version,

            router: vue2.$router

          }

        }

      }

      const parent = (el as HTMLElement & { __vueParentComponent?: { proxy?: FarmerVue } }).__vueParentComponent

      if (parent?.proxy && typeof parent.proxy.getRim === 'function') {

        const rim = parent.proxy.getRim?.()

        if (rim) {

          return {

            rim,

            imLoginInfo: parent.proxy.userInfo,

            xhsApiService: parent.proxy.$parent?.services,

            version: parent.proxy.$parent?.version,

            router: parent.proxy.$router

          }

        }

      }

    } catch {

      /* ignore */

    }

    el = el.parentElement

  }



  const app = document.querySelector('#app') as HTMLElement & {

    __vue_app__?: { _instance?: { subTree?: unknown } }

  }

  const subTree = app?.__vue_app__?._instance?.subTree

  if (subTree) {

    const raw = walkVue3GetRim(subTree as Parameters<typeof walkVue3GetRim>[0], 0, new Set())

    if (raw) {

      const w = window as Window & { ImLoginInfo?: FarmerVue['userInfo']; XhsApiService?: unknown }

      return {

        rim: raw,

        imLoginInfo: w.ImLoginInfo,

        xhsApiService: w.XhsApiService,

        version: undefined,

        router: undefined

      }

    }

  }

  return null

}



export function startRimBootstrap(): void {

  if (typeof window === 'undefined') return

  const w = window as Window & {

    __xhsRimBootstrapStarted?: boolean

    __xhsGetXhsApiInterval?: ReturnType<typeof setInterval>

    XhsRim?: RimLike

    ImLoginInfo?: FarmerVue['userInfo']

    XhsApiService?: unknown

    VueRouter?: unknown

  }

  if (w.__xhsRimBootstrapStarted) return

  w.__xhsRimBootstrapStarted = true



  const tryBootstrap = (): boolean => {

    try {

      if (w.XhsRim && w.ImLoginInfo && isFullRim(w.XhsRim)) return true

      const ctx = resolveFarmerImContext()

      if (!ctx?.rim) return false

      const imLoginInfo = ctx.imLoginInfo

      const xhsApiService = ctx.xhsApiService

      if (!imLoginInfo?.csProviderId) return false

      if (ctx.version) {

        ;(w as unknown as { __xhsChatSdkVersion?: string }).__xhsChatSdkVersion = ctx.version

      }

      if (ctx.router) w.VueRouter = ctx.router

      w.XhsRim = ctx.rim

      if (xhsApiService) w.XhsApiService = xhsApiService

      w.ImLoginInfo = imLoginInfo

      console.log('[xhs-preload] getXhsAPI OK csProviderId=' + (imLoginInfo.csProviderId || ''))

      return true

    } catch (e) {

      console.warn('[xhs-preload] getXhsAPI err', e)

      return false

    }

  }



  w.__xhsGetXhsApiInterval = window.setInterval(() => {

    if (tryBootstrap() && w.__xhsGetXhsApiInterval) {

      window.clearInterval(w.__xhsGetXhsApiInterval)

      w.__xhsGetXhsApiInterval = undefined

    }

  }, 500)



  if (document.readyState === 'loading') {

    window.addEventListener('DOMContentLoaded', tryBootstrap)

  } else {

    tryBootstrap()

  }

}


