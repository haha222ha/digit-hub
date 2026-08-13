/**
 * 对标官方千帆 NeDB：主进程落盘 userData/db/{name}.json
 */
import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type Doc = Record<string, unknown>

const stores = new Map<string, Doc[]>()

function dbDir(): string {
  const dir = join(app.getPath('userData'), 'db')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function dbFile(name: string): string {
  return join(dbDir(), `${name}.json`)
}

function load(name: string): Doc[] {
  if (stores.has(name)) return stores.get(name)!
  let docs: Doc[] = []
  try {
    if (existsSync(dbFile(name))) {
      const raw = JSON.parse(readFileSync(dbFile(name), 'utf8'))
      if (Array.isArray(raw)) docs = raw
    }
  } catch {
    docs = []
  }
  stores.set(name, docs)
  return docs
}

function save(name: string): void {
  try {
    writeFileSync(dbFile(name), JSON.stringify(stores.get(name) || [], null, 0), 'utf8')
  } catch {
    // ignore
  }
}

function asRecord(v: unknown): Doc {
  return v && typeof v === 'object' ? (v as Doc) : {}
}

function matchQuery(doc: Doc, query: Doc): boolean {
  return Object.entries(query).every(([k, v]) => {
    if (k === '$or' && Array.isArray(v)) {
      return v.some((q) => matchQuery(doc, q as Doc))
    }
    return doc[k] === v
  })
}

export function registDb(dbName: string): void {
  load(dbName)
}

export function invokeDb(dbName: string, fnName: string, args: unknown[]): unknown {
  const docs = load(dbName)
  const nextId = () => `${dbName}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  switch (fnName) {
    case 'insert': {
      const doc = args[0]
      const rows = Array.isArray(doc) ? doc : [doc]
      const inserted = rows.map((row) => {
        const r = asRecord(row)
        const copy = { ...r, _id: r._id ?? nextId() }
        docs.push(copy)
        return copy
      })
      save(dbName)
      return Array.isArray(doc) ? inserted : inserted[0]
    }
    case 'update': {
      const q = asRecord(args[0])
      const setDoc = asRecord(asRecord(args[1]).$set ?? args[1])
      let n = 0
      for (const d of docs) {
        if (Object.keys(q).length === 0 || matchQuery(d, q)) {
          Object.assign(d, setDoc)
          n++
        }
      }
      save(dbName)
      return n
    }
    case 'remove': {
      const q = asRecord(args[0])
      const before = docs.length
      for (let i = docs.length - 1; i >= 0; i--) {
        if (matchQuery(docs[i], q)) docs.splice(i, 1)
      }
      save(dbName)
      return before - docs.length
    }
    case 'find':
      return docs.filter((d) => matchQuery(d, asRecord(args[0])))
    case 'findOne':
      return docs.find((d) => matchQuery(d, asRecord(args[0]))) ?? null
    case 'count':
      return docs.filter((d) => matchQuery(d, asRecord(args[0]))).length
    default:
      return null
  }
}

export function bindEvaNedbIpc(): void {
  ipcMain.on('db:registDb', (e, dbName: string) => {
    registDb(String(dbName || 'default'))
    e.returnValue = true
  })
}
