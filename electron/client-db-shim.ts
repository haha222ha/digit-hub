/**
 * 对标千帆 Eva clientDb.registDb → 主进程 NeDB（db:registDb + db:invokeFn IPC）
 */
import { ipcRenderer } from 'electron'

export type MemoryDb = Record<string, (...args: unknown[]) => unknown>

const dbCache = new Map<string, MemoryDb>()

function isCallback(args: unknown[]): args is [...unknown[], (err: unknown, result?: unknown) => void] {
  return typeof args[args.length - 1] === 'function'
}

function wrapAsync(work: (...params: unknown[]) => unknown) {
  return (...args: unknown[]) => {
    if (isCallback(args)) {
      const cb = args[args.length - 1] as (err: unknown, result?: unknown) => void
      const params = args.slice(0, -1)
      Promise.resolve()
        .then(() => work(...params))
        .then((result) => cb(null, result))
        .catch((err) => cb(err))
      return
    }
    return Promise.resolve(work(...args))
  }
}

function invokeDb(dbName: string, fnName: string, ...params: unknown[]) {
  return ipcRenderer.invoke('db:invokeFn', dbName, fnName, ...params)
}

function createIpcDb(dbName: string): MemoryDb {
  const name = String(dbName || 'default')
  return {
    insert: wrapAsync((doc: unknown) => invokeDb(name, 'insert', doc)),
    update: wrapAsync((query: unknown, update: unknown) => invokeDb(name, 'update', query, update)),
    remove: wrapAsync((query: unknown) => invokeDb(name, 'remove', query)),
    find: wrapAsync((query?: unknown) => invokeDb(name, 'find', query)),
    findOne: wrapAsync((query?: unknown) => invokeDb(name, 'findOne', query)),
    count: wrapAsync((query?: unknown) => invokeDb(name, 'count', query)),
  }
}

export function registDb(dbName: string): MemoryDb {
  const name = String(dbName || 'default')
  try {
    ipcRenderer.sendSync('db:registDb', name)
  } catch {
    ipcRenderer.send('db:registDb', name)
  }
  let db = dbCache.get(name)
  if (!db) {
    db = createIpcDb(name)
    dbCache.set(name, db)
  }
  return db
}

export function createClientDb() {
  return { registDb }
}
