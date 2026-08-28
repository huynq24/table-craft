import { useState } from 'react'
import {
  Sun,
  Moon,
  Plus,
  Power,
  Pencil,
  Trash2,
  Play,
  Table2,
  Eye,
  Database,
  Star,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Zap,
  Sigma
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useThemeStore } from '../store/themeStore'
import CreateTableModal from './CreateTableModal'
import type { ConnectionSummary, RoutineInfo, TriggerInfo } from '@shared/types'

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
    connectionGroups,
    setConnectionGroups,
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
    activeTabId,
    closeTab,
    sidebarWidth
  } = useAppStore()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [groupsCollapsed, setGroupsCollapsed] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({})
  const [schemaByConnection, setSchemaByConnection] = useState<Record<string, string>>({})
  const [creatingTableFor, setCreatingTableFor] = useState<string | null>(null)

  // Triggers/Routines are lazy-loaded per connection the first time their section is expanded.
  const [triggersExpanded, setTriggersExpanded] = useState<Set<string>>(new Set())
  const [routinesExpanded, setRoutinesExpanded] = useState<Set<string>>(new Set())
  const [triggersByConnection, setTriggersByConnection] = useState<Record<string, TriggerInfo[]>>({})
  const [routinesByConnection, setRoutinesByConnection] = useState<Record<string, RoutineInfo[]>>({})

  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  async function loadTables(id: string): Promise<void> {
    const schema = await window.api.db.defaultSchema(id)
    setSchemaByConnection((prev) => ({ ...prev, [id]: schema }))
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

  async function handleToggleFavorite(conn: ConnectionSummary): Promise<void> {
    const saved = await window.api.connections.save({ ...conn, password: '', favorite: !conn.favorite })
    setSavedConnections(savedConnections.map((c) => (c.id === conn.id ? saved : c)))
  }

  function handleOpenQuery(conn: ConnectionSummary): void {
    openTab({
      id: `query-${conn.id}-${crypto.randomUUID()}`,
      connectionId: conn.id,
      kind: 'query',
      title: `Query — ${conn.name}`
    })
  }

  async function handleDeleteGroup(groupId: string, name: string): Promise<void> {
    if (!confirm(`Delete group "${name}"? Its connections become ungrouped (not deleted).`)) return
    await window.api.connections.deleteGroup(groupId)
    setConnectionGroups(connectionGroups.filter((g) => g.id !== groupId))
    setSavedConnections(savedConnections.map((c) => (c.groupId === groupId ? { ...c, groupId: undefined } : c)))
  }

  function toggleGroupCollapsed(id: string): void {
    setGroupsCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function toggleTriggers(conn: ConnectionSummary): Promise<void> {
    const isOpen = triggersExpanded.has(conn.id)
    setTriggersExpanded((prev) => {
      const next = new Set(prev)
      if (isOpen) next.delete(conn.id)
      else next.add(conn.id)
      return next
    })
    if (!isOpen && !triggersByConnection[conn.id]) {
      const schema = schemaByConnection[conn.id] ?? (await window.api.db.defaultSchema(conn.id))
      const list = await window.api.db.listTriggers(conn.id, schema).catch(() => [])
      setTriggersByConnection((prev) => ({ ...prev, [conn.id]: list }))
    }
  }

  async function toggleRoutines(conn: ConnectionSummary): Promise<void> {
    const isOpen = routinesExpanded.has(conn.id)
    setRoutinesExpanded((prev) => {
      const next = new Set(prev)
      if (isOpen) next.delete(conn.id)
      else next.add(conn.id)
      return next
    })
    if (!isOpen && !routinesByConnection[conn.id]) {
      const schema = schemaByConnection[conn.id] ?? (await window.api.db.defaultSchema(conn.id))
      const list = await window.api.db.listRoutines(conn.id, schema).catch(() => [])
      setRoutinesByConnection((prev) => ({ ...prev, [conn.id]: list }))
    }
  }

  function openTriggerTab(conn: ConnectionSummary, trigger: TriggerInfo | null): void {
    const schema = schemaByConnection[conn.id] ?? ''
    const name = trigger?.name ?? ''
    openTab({
      id: `trigger-${conn.id}-${schema}-${name || crypto.randomUUID()}`,
      connectionId: conn.id,
      kind: 'trigger',
      title: trigger ? trigger.name : 'New Trigger',
      schema,
      table: trigger?.table,
      objectName: name || undefined,
      isNew: !trigger
    })
  }

  function openRoutineTab(conn: ConnectionSummary, routine: RoutineInfo | null): void {
    const schema = schemaByConnection[conn.id] ?? ''
    const name = routine?.name ?? ''
    openTab({
      id: `routine-${conn.id}-${schema}-${name || crypto.randomUUID()}`,
      connectionId: conn.id,
      kind: 'routine',
      title: routine ? routine.name : 'New Routine',
      schema,
      objectName: name || undefined,
      routineType: routine?.type ?? 'procedure',
      isNew: !routine
    })
  }

  function renderConnectionRow(conn: ConnectionSummary): JSX.Element {
    const isConnected = connectedIds.has(conn.id)
    const isExpanded = expanded.has(conn.id)
    const allTables = tablesByConnection[conn.id] ?? []
    const search = (tableSearch[conn.id] ?? '').trim().toLowerCase()
    const tables = search ? allTables.filter((t) => t.name.toLowerCase().includes(search)) : allTables
    const triggers = triggersByConnection[conn.id] ?? []
    const routines = routinesByConnection[conn.id] ?? []

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
            <button
              className="icon-btn"
              title={conn.favorite ? 'Unfavorite' : 'Mark as favorite'}
              onClick={(e) => {
                e.stopPropagation()
                handleToggleFavorite(conn)
              }}
            >
              <Star size={13} fill={conn.favorite ? 'var(--yellow)' : 'none'} style={{ color: 'var(--yellow)' }} />
            </button>
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
            <div className="table-row" onClick={() => handleOpenQuery(conn)} title="New SQL query">
              <span className="table-icon">
                <Play size={11} />
              </span>
              <span>New Query</span>
            </div>
            {allTables.length > 0 && (
              <div style={{ padding: '2px 10px 6px', display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <input
                  className="filter-input"
                  data-search-input
                  style={{ width: '100%', padding: '4px 8px', fontSize: 12 }}
                  placeholder="Search tables…"
                  value={tableSearch[conn.id] ?? ''}
                  onChange={(e) => setTableSearch((prev) => ({ ...prev, [conn.id]: e.target.value }))}
                />
                <button className="icon-btn" title="New table" onClick={() => setCreatingTableFor(conn.id)}>
                  <Plus size={13} />
                </button>
              </div>
            )}
            {tables.map((t) => {
              const tabId = `table-${conn.id}-${t.schema}-${t.name}`
              const isActiveTable = activeTabId === tabId
              return (
                <div
                  key={`${t.schema}.${t.name}`}
                  className={`table-row${isActiveTable ? ' active' : ''}`}
                  onClick={() =>
                    openTab({
                      id: tabId,
                      connectionId: conn.id,
                      kind: 'table',
                      title: t.name,
                      schema: t.schema,
                      table: t.name
                    })
                  }
                >
                  <span className="table-icon">{t.type === 'view' ? <Eye size={11} /> : <Table2 size={11} />}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                </div>
              )
            })}
            {tables.length === 0 && (
              <div style={{ padding: '4px 10px', color: 'var(--text-dim)', fontSize: 11 }}>
                {search ? 'No matching tables found' : 'No tables'}
              </div>
            )}

            <div className="table-row" onClick={() => toggleTriggers(conn)} title="Triggers">
              <span className="table-icon">
                {triggersExpanded.has(conn.id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </span>
              <span>Triggers{triggers.length > 0 ? ` (${triggers.length})` : ''}</span>
            </div>
            {triggersExpanded.has(conn.id) && (
              <div style={{ paddingLeft: 14 }}>
                <div className="table-row" onClick={() => openTriggerTab(conn, null)}>
                  <span className="table-icon">
                    <Plus size={11} />
                  </span>
                  <span>New Trigger</span>
                </div>
                {triggers.map((trig) => (
                  <div key={trig.name} className="table-row" onClick={() => openTriggerTab(conn, trig)}>
                    <span className="table-icon">
                      <Zap size={11} />
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{trig.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="table-row" onClick={() => toggleRoutines(conn)} title="Procedures & Functions">
              <span className="table-icon">
                {routinesExpanded.has(conn.id) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </span>
              <span>Routines{routines.length > 0 ? ` (${routines.length})` : ''}</span>
            </div>
            {routinesExpanded.has(conn.id) && (
              <div style={{ paddingLeft: 14 }}>
                <div className="table-row" onClick={() => openRoutineTab(conn, null)}>
                  <span className="table-icon">
                    <Plus size={11} />
                  </span>
                  <span>New Routine</span>
                </div>
                {routines.map((rt) => (
                  <div key={rt.name} className="table-row" onClick={() => openRoutineTab(conn, rt)}>
                    <span className="table-icon">
                      <Sigma size={11} />
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rt.name} <span style={{ opacity: 0.6 }}>({rt.type})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const favorites = savedConnections.filter((c) => c.favorite)
  const nonFavorites = savedConnections.filter((c) => !c.favorite)
  const byGroup = new Map<string, ConnectionSummary[]>()
  const ungrouped: ConnectionSummary[] = []
  nonFavorites.forEach((c) => {
    if (c.groupId) {
      const arr = byGroup.get(c.groupId) ?? []
      arr.push(c)
      byGroup.set(c.groupId, arr)
    } else {
      ungrouped.push(c)
    }
  })

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      {creatingTableFor && <CreateTableModal connectionId={creatingTableFor} onClose={() => setCreatingTableFor(null)} />}
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

        {favorites.length > 0 && (
          <>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Star size={11} fill="var(--yellow)" style={{ color: 'var(--yellow)' }} /> Favorites
            </div>
            {favorites.map(renderConnectionRow)}
          </>
        )}

        {connectionGroups.map((group) => {
          const members = byGroup.get(group.id) ?? []
          if (members.length === 0) return null
          const collapsed = groupsCollapsed.has(group.id)
          return (
            <div key={group.id}>
              <div
                className="section-title"
                style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', justifyContent: 'space-between' }}
                onClick={() => toggleGroupCollapsed(group.id)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {collapsed ? <Folder size={11} /> : <FolderOpen size={11} />} {group.name}
                </span>
                <button
                  className="icon-btn"
                  title="Delete group"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteGroup(group.id, group.name)
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {!collapsed && members.map(renderConnectionRow)}
            </div>
          )
        })}

        {ungrouped.length > 0 && connectionGroups.length > 0 && (
          <div className="section-title">Ungrouped</div>
        )}
        {ungrouped.map(renderConnectionRow)}
      </div>
      <div className="sidebar-footer">
        <button className="btn primary" style={{ width: '100%' }} onClick={() => openConnectModal(null)}>
          + New Connection
        </button>
      </div>
    </div>
  )
}
