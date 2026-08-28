import { app } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { QuerySnippet } from '@shared/types'

interface StoreShape {
  snippets: QuerySnippet[]
}

function filePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'query-snippets.json')
}

function load(): StoreShape {
  const file = filePath()
  if (!existsSync(file)) return { snippets: [] }
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as StoreShape
  } catch {
    return { snippets: [] }
  }
}

function save(data: StoreShape): void {
  writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export const querySnippetStore = {
  /** Every snippet usable from this connection: global (no connectionId) + this connection's own. */
  list(connectionId?: string): QuerySnippet[] {
    const data = load()
    const filtered = connectionId
      ? data.snippets.filter((s) => !s.connectionId || s.connectionId === connectionId)
      : data.snippets
    return [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  save(snippet: Omit<QuerySnippet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): QuerySnippet {
    const data = load()
    const now = new Date().toISOString()
    const id = snippet.id || randomUUID()
    const existing = data.snippets.find((s) => s.id === id)
    const full: QuerySnippet = {
      id,
      connectionId: snippet.connectionId,
      name: snippet.name,
      sql: snippet.sql,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    const idx = data.snippets.findIndex((s) => s.id === id)
    if (idx >= 0) data.snippets[idx] = full
    else data.snippets.push(full)
    save(data)
    return full
  },

  remove(id: string): void {
    const data = load()
    data.snippets = data.snippets.filter((s) => s.id !== id)
    save(data)
  }
}
