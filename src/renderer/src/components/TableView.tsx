import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import {
  RefreshCw,
  ClipboardPaste,
  Undo2,
  Redo2,
  X,
  ListFilter,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Check
} from 'lucide-react'
import type { Tab } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import DataGrid from './DataGrid'
import StructureView from './StructureView'
import ErrorDialog from './ErrorDialog'
import type { FilterCondition, FilterOperator } from '@shared/types'

const DEFAULT_PAGE_SIZE = 100
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500, 1000, 5000]

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: 'LIKE', label: 'contains (LIKE)' },
  { value: 'IS NULL', label: 'IS NULL' },
  { value: 'IS NOT NULL', label: 'IS NOT NULL' }
]

interface DraftCondition {
  id: string
  column: string
  operator: FilterOperator
  value: string
}

function needsValue(op: FilterOperator): boolean {
  return op !== 'IS NULL' && op !== 'IS NOT NULL'
}

interface Props {
  tab: Tab
}

export default function TableView({ tab }: Props): JSX.Element {
  const { connectionId, schema = '', table = '' } = tab
  const { closeTab, setTables, tablesByConnection, activeTabId } = useAppStore()

  const [subview, setSubview] = useState<'data' | 'structure'>('data')

  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [pkColumns, setPkColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Save can fail per-row (e.g. one of several deletes hits a foreign key constraint) —
  // collecting every failure into a dialog instead of squeezing them into one banner line.
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [durationMs, setDurationMs] = useState<number | null>(null)

  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined)
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC')

  // Column-based filter builder (feature 3) + a raw SQL fallback for power users.
  const [advancedMode, setAdvancedMode] = useState(false)
  const [conditions, setConditions] = useState<DraftCondition[]>([])
  const [appliedFilters, setAppliedFilters] = useState<FilterCondition[]>([])
  const [rawFilterInput, setRawFilterInput] = useState('')
  const [rawFilter, setRawFilter] = useState('')

  const [pendingEdits, setPendingEdits] = useState<Record<number, Record<string, unknown>>>({})
  const [newRows, setNewRows] = useState<Record<string, unknown>[]>([])
  const [refreshSignal, setRefreshSignal] = useState(0)

  // Deleting an existing row (feature 8) is now staged, not immediate: the row index just
  // gets marked and stays visible (struck through) until Save actually issues the DELETE.
  // Clicking delete again on an already-marked row un-marks it.
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set())

  // Row selection (feature 7): click to select, Ctrl/Cmd-click to toggle, Shift-click for a range.
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)

  // Undo/redo (feature 7 & 8) covers staged-but-unsaved changes — cell edits, added/duplicated/
  // pasted rows, marking/unmarking rows for deletion, and discard. Saving is immediate (it's
  // what actually commits the staged deletes/edits/inserts to the DB), so that stays outside undo.
  type EditSnapshot = {
    pendingEdits: Record<number, Record<string, unknown>>
    newRows: Record<string, unknown>[]
    pendingDeletes: Set<number>
  }
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<EditSnapshot[]>([])

  function snapshot(): EditSnapshot {
    return {
      pendingEdits: structuredClone(pendingEdits),
      newRows: structuredClone(newRows),
      pendingDeletes: new Set(pendingDeletes)
    }
  }

  function pushHistory(): void {
    setUndoStack((prev) => [...prev, snapshot()])
    setRedoStack([])
  }

  function handleUndo(): void {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    setRedoStack((prev) => [...prev, snapshot()])
    setUndoStack((prev) => prev.slice(0, -1))
    setPendingEdits(last.pendingEdits)
    setNewRows(last.newRows)
    setPendingDeletes(last.pendingDeletes)
  }

  function handleRedo(): void {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack((prev) => [...prev, snapshot()])
    setRedoStack((prev) => prev.slice(0, -1))
    setPendingEdits(next.pendingEdits)
    setNewRows(next.newRows)
    setPendingDeletes(next.pendingDeletes)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, pk] = await Promise.all([
        window.api.db.getTableData({
          connectionId,
          schema,
          table,
          limit: pageSize,
          offset,
          orderBy: sortColumn,
          orderDir: sortDir,
          filter: advancedMode ? rawFilter || undefined : undefined,
          filters: !advancedMode && appliedFilters.length ? appliedFilters : undefined
        }),
        window.api.db.getPrimaryKeyColumns(connectionId, schema, table)
      ])
      if (data.error) {
        setError(data.error)
      } else {
        setColumns(data.columns)
        setRows(data.rows)
        setDurationMs(data.durationMs)
      }
      setPkColumns(pk)
      setPendingEdits({})
      setNewRows([])
      setPendingDeletes(new Set())
      setSelectedRows(new Set())
      setSelectionAnchor(null)
      setUndoStack([])
      setRedoStack([])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [connectionId, schema, table, offset, pageSize, sortColumn, sortDir, advancedMode, rawFilter, appliedFilters])

  useEffect(() => {
    load()
  }, [load])

  const isDirty = Object.keys(pendingEdits).length > 0 || newRows.length > 0 || pendingDeletes.size > 0
  // Save is otherwise silent (no toast, just a re-fetch) — this flashes a confirmation
  // in the status bar so it's never ambiguous whether the click actually did anything.
  const [savedFlash, setSavedFlash] = useState(false)

  async function handleSave(): Promise<void> {
    setLoading(true)
    setError(null)
    setSaveErrors([])
    setSavedFlash(false)
    const errors: string[] = []
    const describePk = (primaryKey: Record<string, unknown>): string =>
      Object.entries(primaryKey)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')
    try {
      for (const [rowIndexStr, changes] of Object.entries(pendingEdits)) {
        const rowIndex = Number(rowIndexStr)
        if (pendingDeletes.has(rowIndex)) continue // being deleted below — no point updating first
        if (pkColumns.length === 0) {
          errors.push('Cannot edit: table has no primary key.')
          continue
        }
        const row = rows[rowIndex]
        const primaryKey: Record<string, unknown> = {}
        pkColumns.forEach((c) => (primaryKey[c] = row[c]))
        try {
          await window.api.db.updateRow({ connectionId, schema, table, primaryKey, changes })
        } catch (err) {
          errors.push(`Update failed (${describePk(primaryKey)}): ${(err as Error).message}`)
        }
      }
      for (let i = 0; i < newRows.length; i++) {
        const newRow = newRows[i]
        const values: Record<string, unknown> = {}
        Object.entries(newRow).forEach(([k, v]) => {
          if (v !== '' && v !== undefined) values[k] = v
        })
        try {
          await window.api.db.insertRow({ connectionId, schema, table, values })
        } catch (err) {
          errors.push(`Insert failed (new row #${i + 1}): ${(err as Error).message}`)
        }
      }
      if (pendingDeletes.size > 0 && pkColumns.length === 0) {
        errors.push('Cannot delete: table has no primary key.')
      } else {
        for (const rowIndex of pendingDeletes) {
          const row = rows[rowIndex]
          if (!row) continue
          const primaryKey: Record<string, unknown> = {}
          pkColumns.forEach((c) => (primaryKey[c] = row[c]))
          try {
            await window.api.db.deleteRow({ connectionId, schema, table, primaryKey })
          } catch (err) {
            errors.push(`Delete failed (${describePk(primaryKey)}): ${(err as Error).message}`)
          }
        }
      }
      // load() resets error state as its first step — set the final message *after* it
      // returns, or a real failure here would flash for a frame and then silently vanish.
      await load()
      if (errors.length) {
        setSaveErrors(errors)
      } else {
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 2000)
      }
    } finally {
      setLoading(false)
    }
  }

  // Feature 4, 5, 7, 8 & 9: Ctrl+S save, Ctrl+R reload, Ctrl+C/V copy/paste selected row(s),
  // Ctrl+D duplicate selected row(s), Delete key to delete selected row(s), Ctrl+Z/Ctrl+Shift+Z
  // undo/redo — scoped to whichever tab is currently focused, since every open tab's TableView
  // stays mounted (just hidden).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (activeTabId !== tab.id) return
      const active = document.activeElement as HTMLElement | null
      const isTextInput =
        !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)

      // Delete key has no modifier and must never fire while actually typing (e.g. deleting
      // a character inside a cell editor or a filter input) — checked before the Ctrl gate below.
      if (e.key === 'Delete' && !isTextInput) {
        if (subview !== 'data' || selectedRows.size === 0) return
        e.preventDefault()
        handleDeleteSelection()
        return
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey
      if (!ctrlOrCmd) return
      const key = e.key.toLowerCase()

      if (key === 's') {
        e.preventDefault()
        if (subview !== 'data' || loading) return
        // Commit whatever cell is being edited right now (its onBlur flushes into
        // pendingEdits) before actually saving, so in-flight edits aren't dropped.
        if (isTextInput) active?.blur()
        window.setTimeout(() => handleSave(), 30)
      } else if (key === 'r') {
        e.preventDefault()
        load()
        setRefreshSignal((s) => s + 1)
      } else if (key === 'c' && !isTextInput) {
        // Let normal text copy happen while editing a cell/filter — only hijack Ctrl+C
        // for row copy when focus isn't in an editable field.
        if (subview !== 'data' || selectedRows.size === 0) return
        e.preventDefault()
        handleCopySelection()
      } else if (key === 'v' && !isTextInput) {
        if (subview !== 'data') return
        e.preventDefault()
        handlePasteRow()
      } else if (key === 'd' && !isTextInput) {
        // Ctrl+D is a browser "bookmark this page" shortcut — always preventDefault so it
        // can't leak through, even when there's no selection to duplicate.
        if (subview !== 'data') return
        e.preventDefault()
        if (selectedRows.size > 0) handleDuplicateSelection()
      } else if (key === 'z' && !isTextInput) {
        if (subview !== 'data') return
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, tab.id, subview, loading, load, pendingEdits, newRows, selectedRows, undoStack, redoStack])

  function handleHeaderClick(col: string): void {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'ASC' ? 'DESC' : 'ASC'))
    } else {
      setSortColumn(col)
      setSortDir('ASC')
    }
    setOffset(0)
  }

  // --- Filter builder (feature 3) ---
  function addCondition(): void {
    setConditions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), column: columns[0] ?? '', operator: '=', value: '' }
    ])
  }

  function updateCondition(id: string, patch: Partial<DraftCondition>): void {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function removeCondition(id: string): void {
    setConditions((prev) => prev.filter((c) => c.id !== id))
  }

  function applyConditions(): void {
    const built: FilterCondition[] = conditions
      .filter((c) => c.column && (!needsValue(c.operator) || c.value.trim() !== ''))
      .map((c) => ({ column: c.column, operator: c.operator, value: c.value }))
    setAppliedFilters(built)
    setOffset(0)
  }

  function clearConditions(): void {
    setConditions([])
    setAppliedFilters([])
    setOffset(0)
  }

  function applyRawFilter(): void {
    setRawFilter(rawFilterInput.trim())
    setOffset(0)
  }

  function toggleAdvanced(): void {
    setAdvancedMode((v) => !v)
    setOffset(0)
  }

  function handlePageSizeChange(size: number): void {
    setPageSize(size)
    setOffset(0)
  }

  function handleCellEdit(rowIndex: number, col: string, value: string | null): void {
    pushHistory()
    if (rowIndex < rows.length) {
      setPendingEdits((prev) => ({ ...prev, [rowIndex]: { ...prev[rowIndex], [col]: value } }))
    } else {
      const newIdx = rowIndex - rows.length
      setNewRows((prev) => {
        const copy = [...prev]
        copy[newIdx] = { ...copy[newIdx], [col]: value }
        return copy
      })
    }
  }

  // Delete (feature 8) is staged, not immediate: for an existing row this just toggles it
  // marked-for-deletion (shown struck through) — the actual DELETE only runs on Save. Clicking
  // an already-marked row un-marks it. A pending *new* row (never in the DB) is still just
  // dropped right away since there's nothing on the server to stage.
  function handleDeleteRow(rowIndex: number): void {
    if (rowIndex < rows.length) {
      if (pkColumns.length === 0) {
        alert('This table has no primary key, so rows cannot be safely deleted.')
        return
      }
      pushHistory()
      setPendingDeletes((prev) => {
        const next = new Set(prev)
        if (next.has(rowIndex)) next.delete(rowIndex)
        else next.add(rowIndex)
        return next
      })
    } else {
      const newIdx = rowIndex - rows.length
      pushHistory()
      setNewRows((prev) => prev.filter((_, i) => i !== newIdx))
    }
  }

  // Delete key (feature 10): delete every currently-selected row in one go. Unlike the
  // single-row toggle above, this always marks (never un-marks) — a batch action reads as
  // "delete these", not "toggle these". Pending new rows in the selection are just dropped.
  function handleDeleteSelection(): void {
    const indices = [...selectedRows]
    if (indices.length === 0) return
    const existingIdx = indices.filter((i) => i < rows.length)
    const newIdxSet = new Set(indices.filter((i) => i >= rows.length).map((i) => i - rows.length))
    if (existingIdx.length > 0 && pkColumns.length === 0) {
      alert('This table has no primary key, so rows cannot be safely deleted.')
      return
    }
    pushHistory()
    if (existingIdx.length > 0) {
      setPendingDeletes((prev) => {
        const next = new Set(prev)
        existingIdx.forEach((i) => next.add(i))
        return next
      })
    }
    if (newIdxSet.size > 0) {
      setNewRows((prev) => prev.filter((_, i) => !newIdxSet.has(i)))
    }
    setSelectedRows(new Set())
  }

  function addBlankRow(): void {
    pushHistory()
    const blank: Record<string, unknown> = {}
    columns.forEach((c) => (blank[c] = ''))
    setNewRows((prev) => [...prev, blank])
  }

  // Duplicate/copy/paste (feature 6 & 9). rowIndex here is an index into displayRows
  // (existing rows first, then pending new rows) — same convention as delete/edit.
  function duplicateRows(indices: number[]): void {
    const clones = indices
      .map((i) => displayRows[i])
      .filter((source): source is Record<string, unknown> => Boolean(source))
      .map((source) => {
        const clone: Record<string, unknown> = {}
        columns.forEach((c) => {
          // Leave primary key columns blank so the DB assigns a fresh one instead of
          // colliding with the row we're duplicating.
          clone[c] = pkColumns.includes(c) ? '' : (source[c] ?? '')
        })
        return clone
      })
    if (clones.length === 0) return
    pushHistory()
    setNewRows((prev) => [...prev, ...clones])
  }

  function handleDuplicateRow(rowIndex: number): void {
    duplicateRows([rowIndex])
  }

  function handleDuplicateSelection(): void {
    duplicateRows([...selectedRows].sort((a, b) => a - b))
  }

  // Copies the given displayRows indices to the clipboard as JSON — a single object for
  // one row (back-compat with the per-row "Copy row" menu item / older clipboard payloads),
  // or an array for a multi-row selection.
  async function copyRowsToClipboard(indices: number[]): Promise<void> {
    if (indices.length === 0) return
    const payload = indices.map((i) => {
      const source = displayRows[i] ?? {}
      const row: Record<string, unknown> = {}
      columns.forEach((c) => (row[c] = source[c]))
      return row
    })
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload.length === 1 ? payload[0] : payload))
    } catch (err) {
      setError(`Could not copy: ${(err as Error).message}`)
    }
  }

  async function handleCopyRow(rowIndex: number): Promise<void> {
    await copyRowsToClipboard([rowIndex])
  }

  async function handleCopySelection(): Promise<void> {
    await copyRowsToClipboard([...selectedRows].sort((a, b) => a - b))
  }

  async function handlePasteRow(): Promise<void> {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch (err) {
      setError(`Could not read clipboard: ${(err as Error).message}`)
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setError('Clipboard doesn\'t contain a valid copied row (expected JSON from "Copy row").')
      return
    }
    const items = Array.isArray(parsed) ? parsed : [parsed]
    if (items.length === 0 || items.some((it) => !it || typeof it !== 'object' || Array.isArray(it))) {
      setError('Clipboard doesn\'t contain valid copied row(s).')
      return
    }
    const rowsToAdd = items.map((item) => {
      const obj = item as Record<string, unknown>
      const row: Record<string, unknown> = {}
      columns.forEach((c) => {
        if (pkColumns.includes(c)) return // let the DB assign a fresh primary key
        row[c] = c in obj ? (obj[c] ?? '') : ''
      })
      return row
    })
    pushHistory()
    setNewRows((prev) => [...prev, ...rowsToAdd])
  }

  function handleDiscard(): void {
    pushHistory()
    setPendingEdits({})
    setNewRows([])
    setPendingDeletes(new Set())
  }

  // Row selection (feature 7): plain click selects only this row, Ctrl/Cmd-click toggles
  // it within the selection, Shift-click extends from the last anchor.
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

  async function handleExport(format: 'csv' | 'json'): Promise<void> {
    const res = await window.api.db.exportTable({
      connectionId,
      schema,
      table,
      format,
      filter: advancedMode ? rawFilter || undefined : undefined
    })
    if (res.ok) alert(`Exported ${res.rowCount} row(s) to ${res.filePath}`)
  }

  async function handleImport(): Promise<void> {
    const filePath = await window.api.db.pickImportFile()
    if (!filePath) return
    const res = await window.api.db.importCsv({ connectionId, schema, table, filePath })
    alert(`Import complete: ${res.inserted}/${res.total} row(s) succeeded, ${res.failed} failed.`)
    load()
  }

  async function handleDropTable(): Promise<void> {
    if (!confirm(`PERMANENTLY delete table "${table}"? This action cannot be undone.`)) return
    await window.api.db.dropTable({ connectionId, schema, table })
    const list = tablesByConnection[connectionId]?.filter((t) => t.name !== table) ?? []
    setTables(connectionId, list)
    closeTab(tab.id)
  }

  const displayRows = [...rows.map((r, i) => ({ ...r, ...pendingEdits[i] })), ...newRows]
  // Newly staged rows (added/duplicated/pasted — feature 11) render pinned to the top of the
  // grid, most-recently-added first, so they're easy to spot instead of scrolling past a big
  // page. displayRows itself keeps existing-then-new ordering (all the pendingEdits/pendingDeletes
  // index math elsewhere depends on that); this is purely a visual permutation for DataGrid.
  const rowOrder = [...newRows.map((_, i) => rows.length + i).reverse(), ...rows.map((_, i) => i)]
  const activeFilterCount = advancedMode ? (rawFilter ? 1 : 0) : appliedFilters.length

  return (
    <>
      {saveErrors.length > 0 && (
        <ErrorDialog title="Save errors" errors={saveErrors} onClose={() => setSaveErrors([])} />
      )}
      <div className="toolbar">
        <div className="subtabs">
          <span className={`subtab${subview === 'data' ? ' active' : ''}`} onClick={() => setSubview('data')}>
            Data
          </span>
          <span className={`subtab${subview === 'structure' ? ' active' : ''}`} onClick={() => setSubview('structure')}>
            Structure
          </span>
        </div>
        {subview === 'data' && (
          <>
            <button className="btn small" onClick={() => { load(); setRefreshSignal((s) => s + 1) }} title="Refresh (Ctrl+R)">
              <RefreshCw size={12} />
            </button>
            <button className="btn small" onClick={addBlankRow}>
              + Row
            </button>
            <button className="btn small" onClick={handlePasteRow} title="Paste a row copied from this or another table">
              <ClipboardPaste size={12} /> Paste Row
            </button>
            <button className="btn small primary" onClick={handleSave} disabled={!isDirty || loading} title="Save (Ctrl+S)">
              Save
            </button>
            <button className="btn small" onClick={handleDiscard} disabled={!isDirty}>
              Discard
            </button>
            <button className="btn small" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
              <Undo2 size={12} />
            </button>
            <button className="btn small" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={12} />
            </button>
            <button className="btn small" onClick={() => handleExport('csv')}>
              Export CSV
            </button>
            <button className="btn small" onClick={() => handleExport('json')}>
              Export JSON
            </button>
            <button className="btn small" onClick={handleImport}>
              Import CSV
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn small" onClick={toggleAdvanced}>
              {advancedMode ? (
                <>
                  <ListFilter size={12} /> Filter builder
                </>
              ) : (
                <>
                  <Settings2 size={12} /> Advanced SQL
                </>
              )}
            </button>
          </>
        )}
        {subview === 'structure' && (
          <button className="btn small danger" onClick={handleDropTable}>
            Drop Table
          </button>
        )}
      </div>

      {subview === 'data' && !advancedMode && (
        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {conditions.map((cond) => (
            <div key={cond.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                value={cond.column}
                onChange={(e) => updateCondition(cond.id, { column: e.target.value })}
                style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4 }}
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(cond.id, { operator: e.target.value as FilterOperator })}
                style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: 4 }}
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {needsValue(cond.operator) && (
                <input
                  className="filter-input"
                  style={{ width: 140 }}
                  placeholder="value…"
                  value={cond.value}
                  onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && applyConditions()}
                />
              )}
              <button className="icon-btn" title="Remove condition" onClick={() => removeCondition(cond.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn small" onClick={addCondition}>
              + Condition
            </button>
            <button className="btn small primary" onClick={applyConditions}>
              Search
            </button>
            {(conditions.length > 0 || appliedFilters.length > 0) && (
              <button className="btn small" onClick={clearConditions}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {subview === 'data' && advancedMode && (
        <div className="toolbar">
          <input
            className="filter-input"
            placeholder="WHERE clause, e.g. id > 10 AND status = 'active'"
            value={rawFilterInput}
            onChange={(e) => setRawFilterInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyRawFilter()}
          />
          <button className="btn small primary" onClick={applyRawFilter}>
            Search
          </button>
        </div>
      )}

      {error && <div className="error-banner" style={{ margin: 8 }}>{error}</div>}

      {subview === 'data' ? (
        <>
          <div className="grid-wrap">
            <DataGrid
              columns={columns}
              rows={displayRows}
              editable
              isDirty={(rowIndex, col) =>
                rowIndex < rows.length ? pendingEdits[rowIndex]?.[col] !== undefined : true
              }
              onCellEdit={handleCellEdit}
              onDeleteRow={handleDeleteRow}
              onDuplicateRow={handleDuplicateRow}
              onCopyRow={handleCopyRow}
              onPasteRow={handlePasteRow}
              onHeaderClick={handleHeaderClick}
              sortColumn={sortColumn}
              sortDir={sortDir}
              offset={offset}
              selectedRows={selectedRows}
              onRowSelect={handleRowSelect}
              pendingDeleteRows={pendingDeletes}
              rowOrder={rowOrder}
            />
          </div>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span
              className="status-text"
              style={savedFlash ? { color: 'var(--success-text)', display: 'inline-flex', alignItems: 'center', gap: 4 } : undefined}
            >
              {loading
                ? 'Loading…'
                : savedFlash
                  ? (
                    <>
                      <Check size={12} /> Saved
                    </>
                  )
                  : `${displayRows.length} rows${durationMs ? ` · ${durationMs.toFixed(0)}ms` : ''}${
                      activeFilterCount ? ` · ${activeFilterCount} filter(s)` : ''
                    }${selectedRows.size ? ` · ${selectedRows.size} selected` : ''}${
                      pendingDeletes.size ? ` · ${pendingDeletes.size} marked for deletion (Save to confirm)` : ''
                    }${pkColumns.length === 0 ? ' · no primary key (read-only edits limited)' : ''}`}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Rows per page
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  style={{ background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: '2px 4px', borderRadius: 4 }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn small" onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={offset === 0}>
                <ChevronLeft size={12} /> Prev
              </button>
              <span className="status-text">
                {offset + 1}–{offset + rows.length}
              </span>
              <button className="btn small" onClick={() => setOffset(offset + pageSize)} disabled={rows.length < pageSize}>
                Next <ChevronRight size={12} />
              </button>
            </span>
          </div>
        </>
      ) : (
        <StructureView connectionId={connectionId} schema={schema} table={table} onChanged={load} refreshSignal={refreshSignal} />
      )}
    </>
  )
}
