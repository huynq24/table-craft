import { app } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { QueryHistoryEntry } from '@shared/types'

/** Hard cap on total stored entries (across all connections) so the file can't grow forever. */
const MAX_ENTRIES = 1000

interface StoreShape {
  entries: QueryHistoryEntry[]
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'query-history.json')
}

function load(): StoreShape {
  const file = filePath()
  if (!existsSync(file)) return { entries: [] }
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as StoreShape
  } catch {
    return { entries: [] }
  }
}

function save(data: StoreShape): void {
  writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export const queryHistoryStore = {
  /** Most-recent-first, optionally scoped to one connection. */
  list(connectionId?: string, limit = 200): QueryHistoryEntry[] {
    const data = load()
    const filtered = connectionId ? data.entries.filter((e) => e.connectionId === connectionId) : data.entries
    return filtered.slice(-limit).reverse()
  },

  add(entry: Omit<QueryHistoryEntry, 'id'>): QueryHistoryEntry {
    const data = load()
    // Re-running the exact same query back-to-back (e.g. mashing Ctrl+Enter) updates the
    // existing entry in place instead of flooding history with duplicates.
    const last = [...data.entries].reverse().find((e) => e.connectionId === entry.connectionId)
    if (last && last.sql.trim() === entry.sql.trim()) {
      Object.assign(last, entry)
      save(data)
      return last
    }
    const full: QueryHistoryEntry = { ...entry, id: randomUUID() }
    data.entries.push(full)
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(data.entries.length - MAX_ENTRIES)
    }
    save(data)
    return full
  },

  remove(id: string): void {
    const data = load()
    data.entries = data.entries.filter((e) => e.id !== id)
    save(data)
  },

  clear(connectionId?: string): void {
    const data = load()
    data.entries = connectionId ? data.entries.filter((e) => e.connectionId !== connectionId) : []
    save(data)
  }
}
