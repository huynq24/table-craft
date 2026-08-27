import { useState } from 'react'
import { Sun, Moon, Plus, Power, Pencil, Trash2, Play, Table2, Eye, Database } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useThemeStore } from '../store/themeStore'
import type { ConnectionSummary } from '@shared/types'

// MySQL and Postgres get their own accent color so connections are scannable at a glance,
// without reproducing either project's trademarked logo.
const DRIVER_COLOR: Record<string, string> = {
  mysql: '#f29111',
  postgres: '#336791'
}

function DriverBadge({ driver }: { driver: string }): JSX.Element {
  return (
    <span
      className="driver-badge"
      style={{ background: DRIVER_COLOR[driver] ?? 'var(--text-dim)' }}
      title={driver}
    >
      <Database size={10} strokeWidth={2.5} />
    </span>
  )
}

export default function Sidebar(): JSX.Element {
  const {
    savedConnections,
    connectedIds,
    activeConnectionId,
    tablesByConnection,
    setConnected,
    setActiveConnection,
    setTables,
    openTab,
    openConnectModal,
    setSavedConnections,
    tabs,
    closeTab
  } = useAppStore()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({})
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  async function loadTables(id: string): Promise<void> {
    const schema = await window.api.db.defaultSchema(id)
    const list = await window.api.db.listTables(id, schema)
    setTables(id, list)
  }

  async function handleConnectionClick(conn: ConnectionSummary): Promise<void> {
    setActiveConnection(conn.id)
    setError(null)
    if (connectedIds.has(conn.id)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(conn.id)) next.delete(conn.id)
        else next.add(conn.id)
        return next
      })
      return
    }
    setBusyId(conn.id)
    try {
      const res = await window.api.db.connectSaved(conn.id)
      if (!res.ok) {
        setError(`Failed to connect to "${conn.name}": ${res.error}`)
        return
      }
      setConnected(conn.id, true)
      setExpanded((prev) => new Set(prev).add(conn.id))
      await loadTables(conn.id)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDisconnect(id: string): Promise<void> {
    await window.api.db.disconnect(id)
    setConnected(id, false)
    tabs.filter((t) => t.connectionId === id).forEach((t) => closeTab(t.id))
  }

  async function handleDelete(conn: ConnectionSummary): Promise<void> {
    if (!confirm(`Delete connection "${conn.name}"?`)) return
    await window.api.connections.delete(conn.id)
    setSavedConnections(savedConnections.filter((c) => c.id !== conn.id))
  }

  function handleOpenQuery(conn: ConnectionSummary): void {
    openTab({
      id: `query-${conn.id}-${crypto.randomUUID()}`,
      connectionId: conn.id,
      kind: 'query',
      title: `Query — ${conn.name}`
    })
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Connections</span>
        <span style={{ display: 'flex', gap: 2 }}>
          <button
            className="icon-btn"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="icon-btn" title="New connection" onClick={() => openConnectModal(null)}>
            <Plus size={14} />
          </button>
        </span>
      </div>
      {error && <div className="error-banner" style={{ margin: 8 }}>{error}</div>}
      <div className="sidebar-list">
        {savedConnections.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            No connections yet. Click <Plus size={11} /> to add one.
          </div>
        )}
        {savedConnections.map((conn) => {
          const isConnected = connectedIds.has(conn.id)
          const isExpanded = expanded.has(conn.id)
          const allTables = tablesByConnection[conn.id] ?? []
          const search = (tableSearch[conn.id] ?? '').trim().toLowerCase()
          const tables = search ? allTables.filter((t) => t.name.toLowerCase().includes(search)) : allTables
          return (
            <div key={conn.id}>
              <div
                className={`conn-row${activeConnectionId === conn.id ? ' active' : ''}`}
                onClick={() => handleConnectionClick(conn)}
              >
                <span className={`conn-dot${isConnected ? ' on' : ''}`} />
                <DriverBadge driver={conn.driver} />
                <span className="conn-name" title={`${conn.host}:${conn.port}/${conn.database}`}>
                  {conn.name}
                </span>
                {busyId === conn.id && <span className="spinner" />}
                <span className="conn-actions">
                  {isConnected && (
                    <button
                      className="icon-btn"
                      title="Disconnect"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDisconnect(conn.id)
                      }}
                    >
                      <Power size={13} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      openConnectModal(conn)
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(conn)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
              {isExpanded && isConnected && (
                <div className="table-list" data-search-container="sidebar-tables">
                  <div
                    className="table-row"
                    onClick={() => handleOpenQuery(conn)}
                    title="New SQL query"
                  >
                    <span className="table-icon"><Play size={11} /></span>
                    <span>New Query</span>
                  </div>
                  {allTables.length > 0 && (
                    <div style={{ padding: '2px 10px 6px' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        className="filter-input"
                        data-search-input
                        style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}
                        placeholder="Search tables…"
                        value={tableSearch[conn.id] ?? ''}
                        onChange={(e) => setTableSearch((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                      />
                    </div>
                  )}
                  {tables.map((t) => (
                    <div
                      key={`${t.schema}.${t.name}`}
                      className="table-row"
                      onClick={() =>
                        openTab({
                          id: `table-${conn.id}-${t.schema}-${t.name}`,
                          connectionId: conn.id,
                          kind: 'table',
                          title: t.name,
                          schema: t.schema,
                          table: t.name
                        })
                      }
                    >
                      <span className="table-icon">
                        {t.type === 'view' ? <Eye size={11} /> : <Table2 size={11} />}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    </div>
                  ))}
                  {tables.length === 0 && (
                    <div style={{ padding: '4px 10px', color: 'var(--text-dim)', fontSize: 11 }}>
                      {search ? 'No matching tables found' : 'No tables'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="sidebar-footer">
        <button className="btn primary" style={{ width: '100%' }} onClick={() => openConnectModal(null)}>
          + New Connection
        </button>
      </div>
    </div>
  )
}
