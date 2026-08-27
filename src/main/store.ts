import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig, ConnectionSummary } from '@shared/types'

interface StoredConnection extends ConnectionSummary {
  /** base64-encoded, OS-encrypted via safeStorage. Empty string if never set. */
  encryptedPassword: string
}

interface StoreShape {
  connections: StoredConnection[]
}

function storeFilePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'connections.json')
}

function load(): StoreShape {
  const file = storeFilePath()
  if (!existsSync(file)) return { connections: [] }
  try {
    const raw = readFileSync(file, 'utf-8')
    return JSON.parse(raw) as StoreShape
  } catch {
    return { connections: [] }
  }
}

function save(data: StoreShape): void {
  writeFileSync(storeFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function encryptPassword(password: string): string {
  if (!password) return ''
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(password, 'utf-8').toString('base64')
  return safeStorage.encryptString(password).toString('base64')
}

function decryptPassword(encrypted: string): string {
  if (!encrypted) return ''
  try {
    const buf = Buffer.from(encrypted, 'base64')
    if (!safeStorage.isEncryptionAvailable()) return buf.toString('utf-8')
    return safeStorage.decryptString(buf)
  } catch {
    return ''
  }
}

export const connectionStore = {
  list(): ConnectionSummary[] {
    return load().connections.map(({ encryptedPassword, ...rest }) => rest)
  },

  getWithPassword(id: string): ConnectionConfig | undefined {
    const found = load().connections.find((c) => c.id === id)
    if (!found) return undefined
    const { encryptedPassword, ...rest } = found
    return { ...rest, password: decryptPassword(encryptedPassword) }
  },

  upsert(config: ConnectionConfig): ConnectionSummary {
    const data = load()
    const id = config.id || randomUUID()
    const stored: StoredConnection = {
      id,
      name: config.name,
      driver: config.driver,
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      ssl: config.ssl,
      color: config.color,
      encryptedPassword: config.password ? encryptPassword(config.password) : (data.connections.find((c) => c.id === id)?.encryptedPassword ?? '')
    }
    const idx = data.connections.findIndex((c) => c.id === id)
    if (idx >= 0) data.connections[idx] = stored
    else data.connections.push(stored)
    save(data)
    const { encryptedPassword, ...rest } = stored
    return rest
  },

  remove(id: string): void {
    const data = load()
    data.connections = data.connections.filter((c) => c.id !== id)
    save(data)
  }
}
