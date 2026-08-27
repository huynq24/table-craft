import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { ConnectionConfig, DriverType } from '@shared/types'

const DEFAULT_PORT: Record<DriverType, number> = { mysql: 3306, postgres: 5432 }

export default function ConnectionModal(): JSX.Element {
  const { editingConnection, closeConnectModal, savedConnections, setSavedConnections } = useAppStore()
  const editing = editingConnection

  const [name, setName] = useState(editing?.name ?? '')
  const [driver, setDriver] = useState<DriverType>(editing?.driver ?? 'mysql')
  const [host, setHost] = useState(editing?.host ?? '127.0.0.1')
  const [port, setPort] = useState(editing?.port ?? DEFAULT_PORT.mysql)
  const [user, setUser] = useState(editing?.user ?? 'root')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState(editing?.database ?? '')
  const [ssl, setSsl] = useState(editing?.ssl ?? false)

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
      color: editing?.color
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

  return (
    <div className="modal-overlay" onClick={closeConnectModal}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">{editing ? 'Edit Connection' : 'New Connection'}</div>
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
