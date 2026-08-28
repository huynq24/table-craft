import { useState } from 'react'
import { Star } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { ConnectionConfig, DriverType, SshAuthMethod, SshTunnelConfig } from '@shared/types'

const DEFAULT_PORT: Record<DriverType, number> = { mysql: 3306, postgres: 5432 }

function emptySsh(): SshTunnelConfig {
  return { enabled: false, host: '', port: 22, user: '', authMethod: 'password', password: '', privateKey: '', passphrase: '' }
}

export default function ConnectionModal(): JSX.Element {
  const { editingConnection, closeConnectModal, savedConnections, setSavedConnections, connectionGroups, setConnectionGroups } =
    useAppStore()
  const editing = editingConnection

  const [name, setName] = useState(editing?.name ?? '')
  const [driver, setDriver] = useState<DriverType>(editing?.driver ?? 'mysql')
  const [host, setHost] = useState(editing?.host ?? '127.0.0.1')
  const [port, setPort] = useState(editing?.port ?? DEFAULT_PORT.mysql)
  const [user, setUser] = useState(editing?.user ?? 'root')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState(editing?.database ?? '')
  const [ssl, setSsl] = useState(editing?.ssl ?? false)
  const [groupId, setGroupId] = useState(editing?.groupId ?? '')
  const [favorite, setFavorite] = useState(editing?.favorite ?? false)

  const [ssh, setSsh] = useState<SshTunnelConfig>(() => ({ ...emptySsh(), ...(editing?.ssh ?? {}) }))

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  function buildConfig(): ConnectionConfig {
    return {
      id: editing?.id ?? '',
      name: name.trim() || `${host}:${port}`,
      driver,
      host,
      port: Number(port),
      user,
      password,
      database,
      ssl,
      color: editing?.color,
      groupId: groupId || undefined,
      favorite,
      ssh: ssh.enabled ? ssh : undefined
    }
  }

  function onDriverChange(d: DriverType): void {
    setDriver(d)
    if (port === DEFAULT_PORT.mysql || port === DEFAULT_PORT.postgres) {
      setPort(DEFAULT_PORT[d])
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.db.connect(buildConfig())
      setTestResult(res.ok ? { ok: true, message: 'Connected successfully!' } : { ok: false, message: res.error ?? 'Unknown error' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      const saved = await window.api.connections.save(buildConfig())
      const exists = savedConnections.some((c) => c.id === saved.id)
      setSavedConnections(
        exists ? savedConnections.map((c) => (c.id === saved.id ? saved : c)) : [...savedConnections, saved]
      )
      closeConnectModal()
    } finally {
      setSaving(false)
    }
  }

  async function handleNewGroup(): Promise<void> {
    const name = prompt('New group name:')
    if (!name || !name.trim()) return
    const group = await window.api.connections.saveGroup({ id: '', name: name.trim() })
    setConnectionGroups([...connectionGroups, group])
    setGroupId(group.id)
  }

  async function handleBrowseKey(): Promise<void> {
    const content = await window.api.system.pickTextFile()
    if (content !== undefined) setSsh({ ...ssh, privateKey: content })
  }

  return (
    <div className="modal-overlay" onClick={closeConnectModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {editing ? 'Edit Connection' : 'New Connection'}
          <button
            className="icon-btn"
            title={favorite ? 'Unfavorite' : 'Mark as favorite'}
            onClick={() => setFavorite((v) => !v)}
          >
            <Star size={15} fill={favorite ? 'var(--yellow)' : 'none'} style={{ color: 'var(--yellow)' }} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Database" />
          </div>
          <div className="field">
            <label>Driver</label>
            <select value={driver} onChange={(e) => onDriverChange(e.target.value as DriverType)}>
              <option value="mysql">MySQL / MariaDB</option>
              <option value="postgres">PostgreSQL</option>
            </select>
          </div>
          <div className="field">
            <label>Group</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Ungrouped</option>
                {connectionGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button className="btn small" onClick={handleNewGroup} type="button">
                + New group
              </button>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Host</label>
              <input value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div className="field">
              <label>Port</label>
              <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>User</label>
              <input value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? '(unchanged)' : ''}
              />
            </div>
          </div>
          <div className="field">
            <label>Database{driver === 'postgres' ? ' (initial)' : ''}</label>
            <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder={driver === 'postgres' ? 'postgres' : ''} />
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="ssl" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
            <label htmlFor="ssl" style={{ textTransform: 'none', fontSize: 12, color: 'var(--text)' }}>
              Use SSL
            </label>
          </div>

          <div className="checkbox-row" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              id="ssh-enabled"
              checked={ssh.enabled}
              onChange={(e) => setSsh({ ...ssh, enabled: e.target.checked })}
            />
            <label htmlFor="ssh-enabled" style={{ textTransform: 'none', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
              Connect via SSH Tunnel
            </label>
          </div>

          {ssh.enabled && (
            <>
              <div className="field-row">
                <div className="field" style={{ flex: 2 }}>
                  <label>SSH Host</label>
                  <input value={ssh.host} onChange={(e) => setSsh({ ...ssh, host: e.target.value })} />
                </div>
                <div className="field">
                  <label>SSH Port</label>
                  <input type="number" value={ssh.port} onChange={(e) => setSsh({ ...ssh, port: Number(e.target.value) })} />
                </div>
              </div>
              <div className="field">
                <label>SSH User</label>
                <input value={ssh.user} onChange={(e) => setSsh({ ...ssh, user: e.target.value })} />
              </div>
              <div className="field">
                <label>Auth method</label>
                <select
                  value={ssh.authMethod}
                  onChange={(e) => setSsh({ ...ssh, authMethod: e.target.value as SshAuthMethod })}
                >
                  <option value="password">Password</option>
                  <option value="privateKey">Private key</option>
                </select>
              </div>
              {ssh.authMethod === 'password' ? (
                <div className="field">
                  <label>SSH Password</label>
                  <input
                    type="password"
                    value={ssh.password ?? ''}
                    onChange={(e) => setSsh({ ...ssh, password: e.target.value })}
                    placeholder={editing?.ssh ? '(unchanged)' : ''}
                  />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>Private key</label>
                    <textarea
                      value={ssh.privateKey ?? ''}
                      onChange={(e) => setSsh({ ...ssh, privateKey: e.target.value })}
                      placeholder={editing?.ssh ? '(unchanged — paste to replace)' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                      rows={4}
                      style={{
                        background: 'var(--bg-0)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 6,
                        color: 'var(--text)',
                        fontFamily: 'var(--mono)',
                        fontSize: 11.5,
                        resize: 'vertical'
                      }}
                    />
                    <button className="btn small" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={handleBrowseKey} type="button">
                      Browse…
                    </button>
                  </div>
                  <div className="field">
                    <label>Passphrase (optional)</label>
                    <input
                      type="password"
                      value={ssh.passphrase ?? ''}
                      onChange={(e) => setSsh({ ...ssh, passphrase: e.target.value })}
                      placeholder={editing?.ssh ? '(unchanged)' : ''}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {testResult && (
            <div className={testResult.ok ? 'success-banner' : 'error-banner'}>
              {testResult.message}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={closeConnectModal}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || !name.trim() && !host}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
