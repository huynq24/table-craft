import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig, ConnectionGroup, ConnectionSummary, SshAuthMethod } from '@shared/types'

/** The SSH side of a stored connection, secrets encrypted the same way the DB password is. */
interface StoredSsh {
  enabled: boolean
  host: string
  port: number
  user: string
  authMethod: SshAuthMethod
  encryptedPassword: string
  encryptedPrivateKey: string
  encryptedPassphrase: string
}

interface StoredConnection extends Omit<ConnectionSummary, 'ssh'> {
  /** base64-encoded, OS-encrypted via safeStorage. Empty string if never set. */
  encryptedPassword: string
  ssh?: StoredSsh
}

interface StoreShape {
  connections: StoredConnection[]
  groups: ConnectionGroup[]
}

function storeFilePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'connections.json')
}

function load(): StoreShape {
  const file = storeFilePath()
  if (!existsSync(file)) return { connections: [], groups: [] }
  try {
    const raw = readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoreShape>
    return { connections: parsed.connections ?? [], groups: parsed.groups ?? [] }
  } catch {
    return { connections: [], groups: [] }
  }
}

function save(data: StoreShape): void {
  writeFileSync(storeFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function encryptSecret(secret: string): string {
  if (!secret) return ''
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(secret, 'utf-8').toString('base64')
  return safeStorage.encryptString(secret).toString('base64')
}

function decryptSecret(encrypted: string): string {
  if (!encrypted) return ''
  try {
    const buf = Buffer.from(encrypted, 'base64')
    if (!safeStorage.isEncryptionAvailable()) return buf.toString('utf-8')
    return safeStorage.decryptString(buf)
  } catch {
    return ''
  }
}

function encryptSsh(ssh: ConnectionConfig['ssh'], previous: StoredSsh | undefined): StoredSsh | undefined {
  if (!ssh) return undefined
  return {
    enabled: ssh.enabled,
    host: ssh.host,
    port: ssh.port,
    user: ssh.user,
    authMethod: ssh.authMethod,
    encryptedPassword: ssh.password ? encryptSecret(ssh.password) : (previous?.encryptedPassword ?? ''),
    encryptedPrivateKey: ssh.privateKey ? encryptSecret(ssh.privateKey) : (previous?.encryptedPrivateKey ?? ''),
    encryptedPassphrase: ssh.passphrase ? encryptSecret(ssh.passphrase) : (previous?.encryptedPassphrase ?? '')
  }
}

function decryptSsh(stored: StoredSsh | undefined): ConnectionConfig['ssh'] {
  if (!stored) return undefined
  return {
    enabled: stored.enabled,
    host: stored.host,
    port: stored.port,
    user: stored.user,
    authMethod: stored.authMethod,
    password: decryptSecret(stored.encryptedPassword),
    privateKey: decryptSecret(stored.encryptedPrivateKey),
    passphrase: decryptSecret(stored.encryptedPassphrase)
  }
}

/** Strips SSH secrets, keeping only the non-secret fields the edit form needs to know SSH is
 *  configured at all (enabled/host/port/user/authMethod) — same guarantee as the DB password. */
function sshSummary(stored: StoredSsh | undefined): ConnectionSummary['ssh'] {
  if (!stored) return undefined
  return { enabled: stored.enabled, host: stored.host, port: stored.port, user: stored.user, authMethod: stored.authMethod }
}

export const connectionStore = {
  list(): ConnectionSummary[] {
    return load().connections.map(({ encryptedPassword, ssh, ...rest }) => ({ ...rest, ssh: sshSummary(ssh) }))
  },

  getWithPassword(id: string): ConnectionConfig | undefined {
    const found = load().connections.find((c) => c.id === id)
    if (!found) return undefined
    const { encryptedPassword, ssh, ...rest } = found
    return { ...rest, password: decryptSecret(encryptedPassword), ssh: decryptSsh(ssh) }
  },

  upsert(config: ConnectionConfig): ConnectionSummary {
    const data = load()
    const id = config.id || randomUUID()
    const previous = data.connections.find((c) => c.id === id)
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
      groupId: config.groupId,
      favorite: config.favorite,
      encryptedPassword: config.password ? encryptSecret(config.password) : (previous?.encryptedPassword ?? ''),
      ssh: encryptSsh(config.ssh, previous?.ssh)
    }
    const idx = data.connections.findIndex((c) => c.id === id)
    if (idx >= 0) data.connections[idx] = stored
    else data.connections.push(stored)
    save(data)
    const { encryptedPassword, ssh, ...rest } = stored
    return rest
  },

  remove(id: string): void {
    const data = load()
    data.connections = data.connections.filter((c) => c.id !== id)
    save(data)
  },

  listGroups(): ConnectionGroup[] {
    return load().groups
  },

  upsertGroup(group: ConnectionGroup): ConnectionGroup {
    const data = load()
    const id = group.id || randomUUID()
    const stored: ConnectionGroup = { id, name: group.name }
    const idx = data.groups.findIndex((g) => g.id === id)
    if (idx >= 0) data.groups[idx] = stored
    else data.groups.push(stored)
    save(data)
    return stored
  },

  deleteGroup(id: string): void {
    const data = load()
    data.groups = data.groups.filter((g) => g.id !== id)
    data.connections.forEach((c) => {
      if (c.groupId === id) c.groupId = undefined
    })
    save(data)
  }
}
