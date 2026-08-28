import { useEffect, useMemo, useState } from 'react'
import { Play, History, X, ChevronLeft, ChevronRight } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { MySQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { autocompletion } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Tab } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import { useThemeStore } from '../store/themeStore'
import DataGrid from './DataGrid'
import { buildRelationMap, buildSqlCompletionSources } from '../lib/sqlCompletion'
import type { QueryHistoryEntry, QueryResult, TableStructure } from '@shared/types'

interface Props {
  tab: Tab
}

// Cap how many tables we eagerly introspect for autocomplete, so opening a query
// tab against a database with thousands of tables doesn't hammer the connection.
const MAX_AUTOCOMPLETE_TABLES = 300

const RESULT_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000]
const DEFAULT_RESULT_PAGE_SIZE = 100

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default function QueryEditor({ tab }: Props): JSX.Element {
  const [text, setText] = useState('SELECT * FROM ')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)

  // Client-side pagination of the result set (feature: paginate large query results —
  // the whole set still comes back in one round trip, but we only render one page of
  // DOM rows at a time so a big SELECT doesn't stall the grid).
  const [resultPage, setResultPage] = useState(0)
  const [resultPageSize, setResultPageSize] = useState(DEFAULT_RESULT_PAGE_SIZE)

  // Query history panel
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [historySearch, setHistorySearch] = useState('')

  const appTheme = useThemeStore((s) => s.theme)
  const driver = useAppStore((s) => s.savedConnections.find((c) => c.id === tab.connectionId)?.driver)
  const dialect = driver === 'mysql' ? MySQL : PostgreSQL

  const [sqlSchema, setSqlSchema] = useState<Record<string, string[]>>({})
  const [defaultSchemaName, setDefaultSchemaName] = useState('')
  const [structures, setStructures] = useState<{ table: string; structure: TableStructure | null }[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)

  // Table/column autocomplete + JOIN suggestions: introspect the connection once when the
  // tab opens so CodeMirror can suggest real table/column names and FK-related join tables,
  // not just keywords.
  useEffect(() => {
    let cancelled = false
    async function loadSchema(): Promise<void> {
      setSchemaLoading(true)
      try {
        const schemaName = await window.api.db.defaultSchema(tab.connectionId)
        const tables = await window.api.db.listTables(tab.connectionId, schemaName)
        const limited = tables.slice(0, MAX_AUTOCOMPLETE_TABLES)
        const fetched = await Promise.all(
          limited.map((t) =>
            window.api.db.getTableStructure(tab.connectionId, schemaName, t.name).catch(() => null)
          )
        )
        if (cancelled) return
        const map: Record<string, string[]> = {}
        limited.forEach((t, i) => {
          map[t.name] = fetched[i]?.columns.map((c) => c.name) ?? []
        })
        setSqlSchema(map)
        setDefaultSchemaName(schemaName)
        setStructures(limited.map((t, i) => ({ table: t.name, structure: fetched[i] })))
      } catch {
        // Autocomplete is a nice-to-have; keyword-only completion still works if this fails.
      } finally {
        if (!cancelled) setSchemaLoading(false)
      }
    }
    loadSchema()
    return () => {
      cancelled = true
    }
  }, [tab.connectionId])

  const relationMap = useMemo(
    () => buildRelationMap(structures.map((s) => s.table), structures.map((s) => s.structure)),
    [structures]
  )
  const relationCount = useMemo(() => Object.values(relationMap).reduce((n, list) => n + list.length, 0), [relationMap])

  const extensions = useMemo(() => {
    const completionSources = buildSqlCompletionSources(dialect, sqlSchema, defaultSchemaName, relationMap)
    return [
      sql({ dialect, schema: sqlSchema, defaultSchema: defaultSchemaName || undefined, upperCaseKeywords: true }),
      autocompletion({ override: completionSources })
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialect, sqlSchema, defaultSchemaName, relationMap])

  async function run(): Promise<void> {
    if (!text.trim()) return
    setRunning(true)
    try {
      const res = await window.api.db.runQuery(tab.connectionId, text)
      setResult(res)
      setResultPage(0)
      if (historyOpen) loadHistory()
    } finally {
      setRunning(false)
    }
  }

  async function loadHistory(): Promise<void> {
    const list = await window.api.history.list(tab.connectionId)
    setHistory(list)
  }

  function toggleHistory(): void {
    setHistoryOpen((v) => {
      const next = !v
      if (next) loadHistory()
      return next
    })
  }

  function useHistoryEntry(entry: QueryHistoryEntry): void {
    setText(entry.sql)
  }

  async function removeHistoryEntry(id: string): Promise<void> {
    await window.api.history.remove(id)
    loadHistory()
  }

  async function clearHistory(): Promise<void> {
    if (!confirm('Clear all query history for this connection?')) return
    await window.api.history.clear(tab.connectionId)
    loadHistory()
  }

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return history
    return history.filter((h) => h.sql.toLowerCase().includes(q))
  }, [history, historySearch])

  async function handleExport(format: 'csv' | 'json'): Promise<void> {
    if (!result || result.rows.length === 0) return
    const res = await window.api.db.exportRows({ rows: result.rows, format, suggestedName: 'query_result' })
    if (res.ok) alert(`Exported ${res.rowCount} row(s) to ${res.filePath}`)
  }

  const pagedRows = result ? result.rows.slice(resultPage * resultPageSize, (resultPage + 1) * resultPageSize) : []
  const totalPages = result ? Math.max(1, Math.ceil(result.rows.length / resultPageSize)) : 1

  return (
    <div className="query-pane">
      <div className="toolbar">
        <button className="btn small primary" onClick={run} disabled={running}>
          {running ? 'Running…' : (
            <>
              <Play size={12} /> Run (Ctrl+Enter)
            </>
          )}
        </button>
        <button className="btn small" onClick={toggleHistory}>
          <History size={12} /> History {history.length > 0 ? `(${history.length})` : ''}
        </button>
        <span
          className="status-text"
          title="Table and column names are suggested as you type (Ctrl+Space). Typing JOIN suggests tables related by foreign key, with the ON clause pre-filled."
        >
          {schemaLoading
            ? 'Loading schema for autocomplete…'
            : `${Object.keys(sqlSchema).length} table(s), ${relationCount} relation(s) indexed`}
        </span>
        {result && !result.error && (
          <span className="status-text">
            {result.affectedRows !== undefined
              ? `${result.affectedRows} row(s) affected`
              : `${result.rowCount} row(s)`}{' '}
            · {result.durationMs.toFixed(0)}ms
          </span>
        )}
      </div>

      {historyOpen && (
        <div
          className="toolbar"
          data-search-container="query-history"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="filter-input"
              data-search-input
              placeholder="Search query history…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <button className="btn small" onClick={clearHistory} disabled={history.length === 0}>
              Clear history
            </button>
          </div>
          <div className="history-list">
            {filteredHistory.length === 0 && (
              <div style={{ padding: '8px 4px', color: 'var(--text-dim)', fontSize: 12 }}>
                {history.length === 0 ? 'No queries run yet on this connection.' : 'No history entries match your search.'}
              </div>
            )}
            {filteredHistory.map((entry) => (
              <div key={entry.id} className="history-item" onClick={() => useHistoryEntry(entry)}>
                <div className="history-item-sql">{entry.sql}</div>
                <div className="history-item-meta">
                  <span className={entry.error ? 'history-item-error' : undefined}>
                    {entry.error ? `Error: ${entry.error}` : `${entry.rowCount ?? 0} row(s)`}
                  </span>
                  <span>{entry.durationMs !== undefined ? `${entry.durationMs.toFixed(0)}ms` : ''}</span>
                  <span>{formatWhen(entry.ranAt)}</span>
                </div>
                <button
                  className="icon-btn"
                  title="Remove from history"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeHistoryEntry(entry.id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="query-editor-wrap">
        <CodeMirror
          value={text}
          height="200px"
          theme={appTheme === 'dark' ? oneDark : 'light'}
          basicSetup={{ autocompletion: false }}
          extensions={extensions}
          onChange={(val) => setText(val)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              run()
            }
          }}
        />
      </div>
      <div className="query-results">
        {result?.error && <div className="error-banner" style={{ margin: 8 }}>{result.error}</div>}
        {result && !result.error && result.columns.length > 0 && (
          <>
            <div className="grid-wrap">
              <DataGrid columns={result.columns} rows={pagedRows} offset={resultPage * resultPageSize} />
            </div>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn small" onClick={() => handleExport('csv')} disabled={result.rows.length === 0}>
                  Export CSV
                </button>
                <button className="btn small" onClick={() => handleExport('json')} disabled={result.rows.length === 0}>
                  Export JSON
                </button>
                <label className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Rows per page
                  <select
                    value={resultPageSize}
                    onChange={(e) => {
                      setResultPageSize(Number(e.target.value))
                      setResultPage(0)
                    }}
                    style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: '2px 4px', borderRadius: 4 }}
                  >
                    {RESULT_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn small" onClick={() => setResultPage((p) => Math.max(0, p - 1))} disabled={resultPage === 0}>
                  <ChevronLeft size={12} /> Prev
                </button>
                <span className="status-text">
                  Page {resultPage + 1}/{totalPages} · {resultPage * resultPageSize + 1}–
                  {resultPage * resultPageSize + pagedRows.length} of {result.rows.length}
                </span>
                <button
                  className="btn small"
                  onClick={() => setResultPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={resultPage >= totalPages - 1}
                >
                  Next <ChevronRight size={12} />
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
