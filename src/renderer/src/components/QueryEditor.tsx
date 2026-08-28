import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Play, History, X, ChevronLeft, ChevronRight, WandSparkles } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import type { EditorView } from '@codemirror/view'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { MySQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { autocompletion } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'
import { format as formatSql } from 'sql-formatter'
import type { Tab } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import { useThemeStore } from '../store/themeStore'
import DataGrid, { formatCell } from './DataGrid'
import ResizeHandle from './ResizeHandle'
import { buildRelationMap, buildSqlCompletionSources } from '../lib/sqlCompletion'
import { splitStatements, statementAtOffset } from '../lib/sqlStatements'
import { detectSingleTableSource, resolveEditability } from '../lib/queryEditability'
import type { QueryHistoryEntry, QueryResult, TableStructure } from '@shared/types'

interface Props {
  tab: Tab
}

// Cap how many tables we eagerly introspect (columns + foreign keys, one query each) for
// autocomplete, so opening a query tab against a database with thousands of tables doesn't
// hammer the connection. This only limits column/JOIN suggestions for the long tail — every
// table's *name* is still suggested (see loadSchema below), since listTables is a single
// cheap call regardless of table count.
const MAX_AUTOCOMPLETE_TABLES = 300

const RESULT_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000]
const DEFAULT_RESULT_PAGE_SIZE = 100

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

interface RanStatement {
  sql: string
  result: QueryResult
}

export default function QueryEditor({ tab }: Props): JSX.Element {
  const [text, setText] = useState('SELECT * FROM ')
  const viewRef = useRef<EditorView | null>(null)
  const activeTabId = useAppStore((s) => s.activeTabId)

  // Ctrl+Enter/Ctrl+Shift+F are wired as a CodeMirror keymap (below, in `extensions`), not a
  // React onKeyDown prop — @uiw/react-codemirror spreads unrecognized props like onKeyDown onto
  // its OUTER wrapper div, not the actual editing surface, so it can't reliably pre-empt
  // CodeMirror's own default handling (e.g. Enter inserting a newline) the way a real keymap
  // binding does. `extensions` is only rebuilt when the schema changes, so the keymap closes
  // over these refs (always current) rather than over `run`/`formatQuery` directly.
  const runRef = useRef<() => void>(() => {})
  const formatQueryRef = useRef<() => void>(() => {})

  // Normally holds a single statement's result, but running a whole multi-statement selection
  // populates one entry per statement (in order), with `activeResultIndex` picking which one
  // is shown. Keeping the SQL text alongside each result lets us decide, per result, whether
  // it's safe to edit in place (see `editability` below).
  const [results, setResults] = useState<RanStatement[]>([])
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const activeRan = results[activeResultIndex] ?? null
  const result = activeRan?.result ?? null
  const [running, setRunning] = useState(false)

  // Client-side pagination of the result set (feature: paginate large query results —
  // the whole set still comes back in one round trip, but we only render one page of
  // DOM rows at a time so a big SELECT doesn't stall the grid).
  const [resultPage, setResultPage] = useState(0)
  const [resultPageSize, setResultPageSize] = useState(DEFAULT_RESULT_PAGE_SIZE)

  // Local, client-side search across the currently-shown result — narrows which rows page/export/
  // select operate on without re-running the query.
  const [resultFilter, setResultFilter] = useState('')

  // Row selection (Ctrl/Cmd-click toggles, Shift-click extends) — indices into the CURRENT
  // page of (filtered) rows, so any change to page/filter/active-statement invalidates it.
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)

  // Query history panel
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<QueryHistoryEntry[]>([])
  const [historySearch, setHistorySearch] = useState('')

  const appTheme = useThemeStore((s) => s.theme)
  const driver = useAppStore((s) => s.savedConnections.find((c) => c.id === tab.connectionId)?.driver)
  const dialect = driver === 'mysql' ? MySQL : PostgreSQL
  const queryEditorHeight = useAppStore((s) => s.queryEditorHeight)
  const resizeQueryEditorBy = useAppStore((s) => s.resizeQueryEditorBy)

  // Every known table name -> its structure, or null if not introspected yet (either still
  // loading, or past MAX_AUTOCOMPLETE_TABLES and never referenced). A key existing at all means
  // the table is real; the value tells you how much we know about it.
  const [tableStructures, setTableStructures] = useState<Record<string, TableStructure | null>>({})
  const [defaultSchemaName, setDefaultSchemaName] = useState('')
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
        const map: Record<string, TableStructure | null> = {}
        // Every table name is a completion candidate, even ones past the introspection cap —
        // otherwise a table beyond MAX_AUTOCOMPLETE_TABLES silently never suggests at all.
        tables.forEach((t) => {
          map[t.name] = null
        })
        limited.forEach((t, i) => {
          map[t.name] = fetched[i]
        })
        setTableStructures(map)
        setDefaultSchemaName(schemaName)
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

  const sqlSchema = useMemo(() => {
    const map: Record<string, string[]> = {}
    Object.entries(tableStructures).forEach(([name, s]) => {
      map[name] = s?.columns.map((c) => c.name) ?? []
    })
    return map
  }, [tableStructures])

  const introspectedCount = useMemo(
    () => Object.values(tableStructures).filter(Boolean).length,
    [tableStructures]
  )

  const relationMap = useMemo(() => {
    const tables = Object.keys(tableStructures)
    return buildRelationMap(tables, tables.map((t) => tableStructures[t]))
  }, [tableStructures])
  const relationCount = useMemo(() => Object.values(relationMap).reduce((n, list) => n + list.length, 0), [relationMap])

  // Column completion (and edit-eligibility, see `editability` below) for a table past the
  // eager-introspection cap: fetched on demand — the first time the user types `thatTable.`,
  // or the first time a query against it runs — instead of never, or upfront for all 300+
  // tables (which is what the cap exists to avoid). One in-flight fetch per table.
  const pendingStructureFetches = useRef<Map<string, Promise<TableStructure | null>>>(new Map())
  function ensureTableStructure(tableName: string): Promise<TableStructure | null> {
    const known = tableStructures[tableName]
    if (known) return Promise.resolve(known)
    const cache = pendingStructureFetches.current
    const pending = cache.get(tableName)
    if (pending) return pending
    const promise = window.api.db
      .getTableStructure(tab.connectionId, defaultSchemaName, tableName)
      .then((structure) => {
        if (structure) setTableStructures((prev) => ({ ...prev, [tableName]: structure }))
        return structure
      })
      .catch(() => null)
      .finally(() => cache.delete(tableName))
    cache.set(tableName, promise)
    return promise
  }
  function ensureColumnsForCompletion(tableName: string): Promise<string[]> {
    return ensureTableStructure(tableName).then((s) => s?.columns.map((c) => c.name) ?? [])
  }

  const extensions = useMemo(() => {
    const completionSources = buildSqlCompletionSources(
      dialect,
      sqlSchema,
      defaultSchemaName,
      relationMap,
      ensureColumnsForCompletion
    )
    return [
      sql({ dialect, schema: sqlSchema, defaultSchema: defaultSchemaName || undefined, upperCaseKeywords: true }),
      // autocompletion() ships its own Ctrl+Space/Escape/Enter keymap (at highest precedence)
      // regardless of basicSetup's autocompletion:false below, so no extra keymap is needed.
      autocompletion({ override: completionSources }),
      // Prec.highest so these always win regardless of extension order — Mod-Enter has no
      // default binding to fight with, but this keeps it deterministic.
      Prec.highest(
        keymap.of([
          { key: 'Mod-Enter', run: () => { runRef.current(); return true } },
          { key: 'Mod-Shift-f', run: () => { formatQueryRef.current(); return true } }
        ])
      )
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialect, sqlSchema, defaultSchemaName, relationMap])

  // If the currently-shown result came from a plain single-table SELECT, try to have that
  // table's structure ready (for its primary key) so editing can turn on as soon as possible
  // instead of only once the user happens to trigger autocomplete on it.
  useEffect(() => {
    if (!activeRan) return
    const table = detectSingleTableSource(activeRan.sql)
    if (table && tableStructures[table] === null) ensureTableStructure(table)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRan, tableStructures])

  const editability = useMemo(() => {
    if (!activeRan) return { target: null, reason: null }
    return resolveEditability(activeRan.sql, activeRan.result.columns, tableStructures)
  }, [activeRan, tableStructures])

  // Decides what to run: a highlighted selection runs just that text, unless the selection
  // spans the whole script (select-all), in which case every statement in it runs in order;
  // with no selection, only the statement the cursor is currently sitting in runs.
  function statementsToRun(): string[] {
    const statements = splitStatements(text)
    if (statements.length === 0) return []

    const sel = viewRef.current?.state.selection.main
    if (sel && !sel.empty) {
      const selectedText = text.slice(sel.from, sel.to)
      const isSelectAll = selectedText.trim() === text.trim()
      if (isSelectAll && statements.length > 1) return statements.map((s) => s.text)
      return [selectedText]
    }

    const cursorOffset = sel ? sel.from : text.length
    const stmt = statementAtOffset(statements, cursorOffset)
    return stmt ? [stmt.text] : []
  }

  function resetResultView(): void {
    setResultPage(0)
    setResultFilter('')
    setSelectedRows(new Set())
    setSelectionAnchor(null)
  }

  function changePage(updater: (p: number) => number): void {
    setResultPage(updater)
    setSelectedRows(new Set())
    setSelectionAnchor(null)
  }

  function selectResultTab(i: number): void {
    setActiveResultIndex(i)
    resetResultView()
  }

  async function run(): Promise<void> {
    const toRun = statementsToRun().filter((s) => s.trim().length > 0)
    if (toRun.length === 0) return
    setRunning(true)
    try {
      const ran: RanStatement[] = []
      for (const stmtSql of toRun) {
        const res = await window.api.db.runQuery(tab.connectionId, stmtSql)
        ran.push({ sql: stmtSql, result: res })
        if (res.error) break // stop the batch at the first failing statement
      }
      setResults(ran)
      setActiveResultIndex(ran.length - 1)
      resetResultView()
      if (historyOpen) loadHistory()
    } finally {
      setRunning(false)
    }
  }

  function formatQuery(): void {
    const view = viewRef.current
    if (!view) return
    const language = driver === 'mysql' ? 'mysql' : 'postgresql'
    const sel = view.state.selection.main
    try {
      if (!sel.empty) {
        const formatted = formatSql(view.state.sliceDoc(sel.from, sel.to), { language, keywordCase: 'upper' })
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: formatted } })
      } else {
        const formatted = formatSql(view.state.doc.toString(), { language, keywordCase: 'upper' })
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } })
      }
    } catch {
      // Best-effort: leave the query untouched if the formatter can't parse it.
    }
  }
  runRef.current = run
  formatQueryRef.current = formatQuery

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

  // Client-side search across every column of the active result — narrows what paging,
  // export, and row-selection operate on without re-running the query.
  const filteredRows = useMemo(() => {
    if (!result) return []
    const q = resultFilter.trim().toLowerCase()
    if (!q) return result.rows
    return result.rows.filter((row) => result.columns.some((c) => formatCell(row[c]).toLowerCase().includes(q)))
  }, [result, resultFilter])

  const pagedRows = filteredRows.slice(resultPage * resultPageSize, (resultPage + 1) * resultPageSize)
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / resultPageSize))

  async function handleExport(format: 'csv' | 'json'): Promise<void> {
    if (filteredRows.length === 0) return
    const res = await window.api.db.exportRows({ rows: filteredRows, format, suggestedName: 'query_result' })
    if (res.ok) alert(`Exported ${res.rowCount} row(s) to ${res.filePath}`)
  }

  // Saves an edit straight to the database (only enabled when `editability.target` is set —
  // a plain single-table SELECT whose primary key is known and present in the result). Looks
  // up the target row by primary key value, not by index, so it stays correct regardless of
  // the local filter/pagination/sort applied on top of the underlying result set.
  async function handleCellEdit(rowIndexInPage: number, col: string, value: string | null): Promise<void> {
    const target = editability.target
    if (!target) return
    const row = pagedRows[rowIndexInPage]
    if (!row) return
    const primaryKey: Record<string, unknown> = {}
    target.pkColumns.forEach((pk) => {
      primaryKey[pk] = row[pk]
    })
    try {
      await window.api.db.updateRow({
        connectionId: tab.connectionId,
        schema: defaultSchemaName,
        table: target.table,
        primaryKey,
        changes: { [col]: value }
      })
      setResults((prev) =>
        prev.map((entry, i) =>
          i === activeResultIndex
            ? {
                ...entry,
                result: {
                  ...entry.result,
                  rows: entry.result.rows.map((r) =>
                    target.pkColumns.every((pk) => r[pk] === primaryKey[pk]) ? { ...r, [col]: value } : r
                  )
                }
              }
            : entry
        )
      )
    } catch (err) {
      alert(`Update failed: ${(err as Error).message}`)
    }
  }

  // Copy (row context menu, and Ctrl+C on a selection) — same clipboard shape as the table
  // browser: a single JSON object for one row, an array for several.
  async function copyRowsToClipboard(rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0 || !result) return
    const payload = rows.map((row) => {
      const obj: Record<string, unknown> = {}
      result.columns.forEach((c) => (obj[c] = row[c]))
      return obj
    })
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload.length === 1 ? payload[0] : payload))
    } catch (err) {
      alert(`Could not copy: ${(err as Error).message}`)
    }
  }
  function handleCopyRow(rowIndexInPage: number): void {
    const row = pagedRows[rowIndexInPage]
    if (row) copyRowsToClipboard([row])
  }
  function handleCopySelection(): void {
    const rows = [...selectedRows]
      .sort((a, b) => a - b)
      .map((i) => pagedRows[i])
      .filter((r): r is Record<string, unknown> => Boolean(r))
    copyRowsToClipboard(rows)
  }

  // Row selection: plain click selects only this row, Ctrl/Cmd-click toggles it within the
  // selection, Shift-click extends from the last anchor — same convention as the table browser.
  function handleRowSelect(rowIndex: number, e: MouseEvent): void {
    if (e.shiftKey && selectionAnchor !== null) {
      const [lo, hi] = selectionAnchor < rowIndex ? [selectionAnchor, rowIndex] : [rowIndex, selectionAnchor]
      const range = new Set<number>()
      for (let i = lo; i <= hi; i++) range.add(i)
      setSelectedRows(range)
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedRows((prev) => {
        const next = new Set(prev)
        if (next.has(rowIndex)) next.delete(rowIndex)
        else next.add(rowIndex)
        return next
      })
      setSelectionAnchor(rowIndex)
    } else {
      setSelectedRows(new Set([rowIndex]))
      setSelectionAnchor(rowIndex)
    }
  }

  // Ctrl+C copies the current row selection, scoped to whichever tab is actually focused since
  // every open tab's QueryEditor stays mounted (just hidden). Skipped while focus is in a text
  // field (SQL editor, filter box, …) so normal text copy still works there.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (activeTabId !== tab.id) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return
      const active = document.activeElement as HTMLElement | null
      const isTextInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isTextInput || selectedRows.size === 0) return
      e.preventDefault()
      handleCopySelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tab.id, selectedRows, pagedRows, result])

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
        <button className="btn small" onClick={formatQuery} title="Format the query (or just the selection)">
          <WandSparkles size={12} /> Format (Ctrl+Shift+F)
        </button>
        <button className="btn small" onClick={toggleHistory}>
          <History size={12} /> History {history.length > 0 ? `(${history.length})` : ''}
        </button>
        <span
          className="status-text"
          title={
            introspectedCount < Object.keys(sqlSchema).length
              ? `Table and column names are suggested as you type, or on demand with Ctrl+Space. Typing JOIN suggests tables related by foreign key, with the ON clause pre-filled. Column/JOIN data is only introspected for the first ${MAX_AUTOCOMPLETE_TABLES} tables — the rest still autocomplete by name.`
              : 'Table and column names are suggested as you type, or on demand with Ctrl+Space. Typing JOIN suggests tables related by foreign key, with the ON clause pre-filled.'
          }
        >
          {schemaLoading
            ? 'Loading schema for autocomplete…'
            : `${Object.keys(sqlSchema).length} table(s), ${relationCount} relation(s) indexed${
                introspectedCount < Object.keys(sqlSchema).length ? ` (columns for first ${MAX_AUTOCOMPLETE_TABLES})` : ''
              }`}
        </span>
        {result && !result.error && (
          <span className="status-text">
            {result.affectedRows !== undefined
              ? `${result.affectedRows} row(s) affected`
              : `${result.rowCount} row(s)`}{' '}
            · {result.durationMs.toFixed(0)}ms
          </span>
        )}
        {result?.error && results.length > 1 && (
          <span className="status-text history-item-error">
            Stopped at statement {activeResultIndex + 1} of {results.length}
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

      <div className="query-editor-wrap" style={{ height: queryEditorHeight }}>
        <CodeMirror
          value={text}
          height={`${queryEditorHeight}px`}
          theme={appTheme === 'dark' ? oneDark : 'light'}
          basicSetup={{ autocompletion: false }}
          extensions={extensions}
          onChange={(val) => setText(val)}
          onCreateEditor={(view) => {
            viewRef.current = view
          }}
        />
      </div>
      <ResizeHandle direction="vertical" onResize={resizeQueryEditorBy} />
      <div className="query-results">
        {results.length > 1 && (
          <div className="toolbar" style={{ gap: 6, background: 'var(--bg-2)' }}>
            <span className="status-text" style={{ fontWeight: 600 }}>
              Ran {results.length} statements — showing:
            </span>
            {results.map((entry, i) => (
              <button
                key={i}
                className={`btn small${i === activeResultIndex ? ' primary' : ''}`}
                onClick={() => selectResultTab(i)}
                title={
                  entry.result.error ??
                  `${entry.result.affectedRows ?? entry.result.rowCount} row(s) · ${entry.result.durationMs.toFixed(0)}ms`
                }
              >
                {entry.result.error ? '✕' : '✓'} Query {i + 1}
              </button>
            ))}
          </div>
        )}
        {result?.error && <div className="error-banner" style={{ margin: 8 }}>{result.error}</div>}
        {result && !result.error && result.columns.length > 0 && (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <input
                className="filter-input"
                placeholder="Filter results…"
                value={resultFilter}
                onChange={(e) => {
                  setResultFilter(e.target.value)
                  setResultPage(0)
                  setSelectedRows(new Set())
                  setSelectionAnchor(null)
                }}
                style={{ maxWidth: 240 }}
              />
              <span
                className="status-text"
                title={editability.reason ?? 'Double-click a cell to edit — saves straight to the database.'}
              >
                {editability.target
                  ? `✎ Editable (${editability.target.table})`
                  : editability.reason
                    ? `Read-only — ${editability.reason}`
                    : ''}
              </span>
            </div>
            <div className="grid-wrap">
              <DataGrid
                columns={result.columns}
                rows={pagedRows}
                offset={resultPage * resultPageSize}
                editable={Boolean(editability.target)}
                onCellEdit={editability.target ? handleCellEdit : undefined}
                onCopyRow={handleCopyRow}
                selectedRows={selectedRows}
                onRowSelect={handleRowSelect}
              />
            </div>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn small" onClick={() => handleExport('csv')} disabled={filteredRows.length === 0}>
                  Export CSV
                </button>
                <button className="btn small" onClick={() => handleExport('json')} disabled={filteredRows.length === 0}>
                  Export JSON
                </button>
                <label className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Rows per page
                  <select
                    value={resultPageSize}
                    onChange={(e) => {
                      setResultPageSize(Number(e.target.value))
                      changePage(() => 0)
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
                <button className="btn small" onClick={() => changePage((p) => Math.max(0, p - 1))} disabled={resultPage === 0}>
                  <ChevronLeft size={12} /> Prev
                </button>
                <span className="status-text">
                  Page {resultPage + 1}/{totalPages} · {resultPage * resultPageSize + 1}–
                  {resultPage * resultPageSize + pagedRows.length} of {filteredRows.length}
                  {resultFilter && ` (filtered from ${result.rows.length})`}
                </span>
                <button
                  className="btn small"
                  onClick={() => changePage((p) => Math.min(totalPages - 1, p + 1))}
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
