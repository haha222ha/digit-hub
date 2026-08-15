/**
 * 安全 loadURL：按 WebContents 串行，加载中不二次导航，同 URL 跳过。
 * 避免 Electron 并发 loadURL / stop() 导致 ACCESS_VIOLATION 闪退。
 */
import type { WebContents } from 'electron'

type LoggerLike = { info?: (m: string) => void; warn?: (m: string) => void }

const wcChains = new Map<number, Promise<unknown>>()

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pathKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return String(url || '')
      .split('?')[0]
      .replace(/\/$/, '')
  }
}

export function isSamePage(current: string, target: string): boolean {
  const a = pathKey(current)
  const b = pathKey(target)
  if (!a || !b) return false
  return a === b || a.startsWith(b) || b.startsWith(a)
}

async function waitUntilIdle(wc: WebContents, maxMs: number): Promise<void> {
  const deadline = Date.now() + Math.max(200, maxMs)
  while (!wc.isDestroyed() && wc.isLoading() && Date.now() < deadline) {
    await sleep(120)
  }
}

/**
 * @returns true=已到达目标或导航成功；false=超时/失败/窗口已毁
 */
export async function safeLoadURL(
  wc: WebContents | null | undefined,
  url: string,
  opts?: {
    timeoutMs?: number
    /** 仍在加载时最多等多久再放弃（不 stop，避免原生崩） */
    waitIdleMs?: number
    force?: boolean
    label?: string
    logger?: LoggerLike
  }
): Promise<boolean> {
  if (!wc || wc.isDestroyed()) return false
  const target = String(url || '').trim()
  if (!target) return false

  const id = wc.id
  const run = async (): Promise<boolean> => {
    if (wc.isDestroyed()) return false

    const waitIdleMs = opts?.waitIdleMs ?? 8000
    if (wc.isLoading()) {
      opts?.logger?.warn?.(
        `[safeLoadURL] 等待加载完成再导航 label=${opts?.label || '-'} cur=${(wc.getURL() || '').slice(0, 70)}`
      )
      await waitUntilIdle(wc, waitIdleMs)
    }
    if (wc.isDestroyed()) return false

    const cur = wc.getURL() || ''
    if (!opts?.force && isSamePage(cur, target)) {
      return true
    }

    const timeoutMs = opts?.timeoutMs ?? 20000
    try {
      await Promise.race([
        wc.loadURL(target),
        sleep(timeoutMs).then(() => {
          throw new Error(`safeLoadURL timeout ${timeoutMs}ms`)
        })
      ])
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!wc.isDestroyed() && isSamePage(wc.getURL() || '', target)) return true
      opts?.logger?.warn?.(`[safeLoadURL] 失败 label=${opts?.label || '-'} ${msg}`)
      return false
    }
  }

  const prev = wcChains.get(id) || Promise.resolve()
  const p = prev.then(run, run)
  wcChains.set(
    id,
    p.then(
      () => undefined,
      () => undefined
    )
  )
  return p
}
