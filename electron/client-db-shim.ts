/**
 * 对标千帆 Eva 的 clientDb.registDb → NeDB 接口（渲染进程内存库）
 * 先前改成 IPC 主进程后易与 SPA 启动竞态；会话列表曾依赖本垫片正常工作。
 */
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

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function matchQuery(doc: Record<string, unknown>, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([k, v]) => {
    if (k === '$or' && Array.isArray(v)) {
      return v.some((q) => matchQuery(doc, q as Record<string, unknown>))
    }
    return doc[k] === v
  })
}

function createMemoryDb(dbName: string): MemoryDb {
  const docs: Record<string, unknown>[] = []
  const nextId = () => `${dbName}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return {
    insert: wrapAsync((doc: unknown) => {
      const rows = Array.isArray(doc) ? doc : [doc]
      const inserted = rows.map((row) => {
        const r = asRecord(row)
        const copy = { ...r, _id: r._id ?? nextId() }
        docs.push(copy)
        return copy
      })
      return Array.isArray(doc) ? inserted : inserted[0]
    }),
    update: wrapAsync((query: unknown, update: unknown) => {
      const q = asRecord(query)
      const setDoc = asRecord(asRecord(update).$set ?? update)
      let n = 0
      for (const d of docs) {
        if (Object.keys(q).length === 0 || matchQuery(d, q)) {
          Object.assign(d, setDoc)
          n++
        }
      }
      return n
    }),
    remove: wrapAsync((query: unknown) => {
      const q = asRecord(query)
      const before = docs.length
      for (let i = docs.length - 1; i >= 0; i--) {
        if (matchQuery(docs[i], q)) docs.splice(i, 1)
      }
      return before - docs.length
    }),
    find: wrapAsync((query?: unknown) => docs.filter((d) => matchQuery(d, asRecord(query)))),
    findOne: wrapAsync((query?: unknown) => docs.find((d) => matchQuery(d, asRecord(query))) ?? null),
    count: wrapAsync((query?: unknown) => docs.filter((d) => matchQuery(d, asRecord(query))).length),
  }
}

export function registDb(dbName: string): MemoryDb {
  let db = dbCache.get(dbName)
  if (!db) {
    db = createMemoryDb(dbName)
    dbCache.set(dbName, db)
  }
  return db
}

export function createClientDb() {
  return { registDb }
}
