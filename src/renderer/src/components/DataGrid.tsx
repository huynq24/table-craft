import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronUp, ChevronDown, RotateCcw, CopyPlus, Copy, ClipboardPaste, X, ArrowUpRight, Filter } from 'lucide-react'
import type { ColumnInfo, ForeignKeyInfo } from '@shared/types'
import { SQL_DEFAULT } from '@shared/types'

/** Best-effort classification of a column's SQL data type, driving which editor renders for it. */
type EditorKind = 'text' | 'boolean' | 'date' | 'datetime'

function editorKindFor(dataType: string | undefined): EditorKind {
  if (!dataType) return 'text'
  const t = dataType.toLowerCase()
  if (t === 'boolean' || t === 'bool' || t.startsWith('tinyint(1)') || t.startsWith('bit(1)')) return 'boolean'
  if (t.includes('datetime') || t.includes('timestamp')) return 'datetime'
  if (t === 'date') return 'date'
  return 'text'
}

/** `<input type="date">` needs `YYYY-MM-DD` — best-effort from whatever the cell holds. */
function toDateInputValue(v: unknown): string {
  if (v === null || v === undefined || v === SQL_DEFAULT) return ''
  const raw = String(v instanceof Date ? v.toISOString() : v)
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return raw.slice(0, 10)
}

/** `<input type="datetime-local">` needs `YYYY-MM-DDTHH:mm`. */
function toDatetimeInputValue(v: unknown): string {
  if (v === null || v === undefined || v === SQL_DEFAULT) return ''
  const raw = String(v instanceof Date ? v.toISOString() : v)
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16)
  return raw.replace(' ', 'T').slice(0, 16)
}

/** Turns the datetime-local input's `YYYY-MM-DDTHH:mm` back into `YYYY-MM-DD HH:MM:SS`, which
 *  both MySQL and Postgres accept natively (sidesteps mysqlAdapter's ISO-with-'T' rejection). */
function normalizeDatetimeInputValue(v: string): string {
  if (!v) return v
  let out = v.replace('T', ' ')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(out)) out += ':00'
  return out
}

export interface DataGridProps {
  columns: string[]
  rows: Record<string, unknown>[]
  editable?: boolean
  isDirty?: (rowIndex: number, col: string) => boolean
  onCellEdit?: (rowIndex: number, col: string, value: string | null) => void
  /** Column data types, keyed by name — picks a boolean/date/datetime editor instead of plain text. */
  columnTypes?: Record<string, ColumnInfo>
  onDeleteRow?: (rowIndex: number) => void
  onDuplicateRow?: (rowIndex: number) => void
  onCopyRow?: (rowIndex: number) => void
  onPasteRow?: (afterRowIndex: number) => void
  onHeaderClick?: (col: string) => void
  /** Right-click on a header → "Filter by this column": seeds a filter condition for it. */
  onFilterByColumn?: (col: string) => void
  /** Foreign keys of the table currently rendered — drives the "jump to referenced row" button. */
  foreignKeys?: ForeignKeyInfo[]
  /** Called when the jump button on a foreign-key cell is clicked. */
  onNavigateFk?: (rowIndex: number, fk: ForeignKeyInfo) => void
  sortColumn?: string
  sortDir?: 'ASC' | 'DESC'
  offset?: number
  selectedRows?: Set<number>
  onRowSelect?: (rowIndex: number, e: MouseEvent) => void
  /** Row indices staged for deletion — shown struck through; clicking delete again un-marks. */
  pendingDeleteRows?: Set<number>
  /**
   * Optional visual render order — an array of indices into `rows`. When given, rows render
   * in this order instead of array order (e.g. so newly staged rows can pin to the top),
   * while every index passed to callbacks/lookups (isDirty, onCellEdit, selectedRows, …)
   * still refers to the row's real position in `rows`, unaffected by the reorder.
   */
  rowOrder?: number[]
}

interface ContextMenuState {
  rowIndex: number
  x: number
  y: number
}

interface HeaderMenuState {
  col: string
  x: number
  y: number
}

export function formatCell(v: unknown): string {
  if (v === SQL_DEFAULT) return 'DEFAULT'
  if (v === null || v === undefined) return 'NULL'
  // MySQL "zero dates" (0000-00-00) decode to a JS Invalid Date; toISOString()
  // throws RangeError on those, so guard rather than let it crash the render.
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '0000-00-00 00:00:00' : v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function DataGrid({
  columns,
  rows,
  editable = false,
  isDirty,
  onCellEdit,
  onDeleteRow,
  onDuplicateRow,
  onCopyRow,
  onPasteRow,
  onHeaderClick,
  onFilterByColumn,
  sortColumn,
  sortDir,
  offset = 0,
  selectedRows,
  onRowSelect,
  pendingDeleteRows,
  rowOrder,
  foreignKeys,
  onNavigateFk,
  columnTypes
}: DataGridProps): JSX.Element {
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [headerMenu, setHeaderMenu] = useState<HeaderMenuState | null>(null)
  // The currently "selected" (not necessarily editing) cell — click a cell to land here, then
  // arrow keys move it around and Enter/F2/Tab hand off into editing (see the keydown effect below).
  const [activeCell, setActiveCell] = useState<{ row: number; col: string } | null>(null)

  const hasRowMenu = Boolean(onDuplicateRow || onCopyRow || onPasteRow || onDeleteRow)

  // One FK per column is all the UI needs — a column referencing two tables at once is
  // exotic enough not to bother picking between them.
  const fkByColumn = useMemo(() => {
    const map = new Map<string, ForeignKeyInfo>()
    foreignKeys?.forEach((fk) => {
      if (!map.has(fk.column)) map.set(fk.column, fk)
    })
    return map
  }, [foreignKeys])

  useEffect(() => {
    if (!contextMenu && !headerMenu) return
    function close(): void {
      setContextMenu(null)
      setHeaderMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu, headerMenu])

  // Visual row order (see rowOrder prop doc) — arrow-key/Tab navigation walks this order so
  // it matches what's actually on screen, not `rows`' underlying array order.
  const visualOrder = rowOrder ?? rows.map((_, i) => i)

  function moveActiveCell(dRow: number, dCol: number): void {
    if (!activeCell) return
    const rowPos = visualOrder.indexOf(activeCell.row)
    const colPos = columns.indexOf(activeCell.col)
    if (rowPos === -1 || colPos === -1) return
    const newRowPos = rowPos + dRow
    const newColPos = colPos + dCol
    if (newRowPos < 0 || newRowPos >= visualOrder.length) return
    if (newColPos < 0 || newColPos >= columns.length) return
    setActiveCell({ row: visualOrder[newRowPos], col: columns[newColPos] })
  }

  // Tab/Shift+Tab step to the next/previous cell, wrapping to the next/previous row at the
  // row's edge (spreadsheet-style) instead of stopping dead at the last/first column. Takes
  // an explicit `from` (rather than always trusting `activeCell`) so it stays correct even
  // when editing was entered via double-click, which doesn't itself set activeCell.
  function tabTarget(forward: boolean, from?: { row: number; col: string } | null): { row: number; col: string } | null {
    const cell = from ?? activeCell
    if (!cell) return null
    const rowPos = visualOrder.indexOf(cell.row)
    const colPos = columns.indexOf(cell.col)
    if (rowPos === -1 || colPos === -1) return null
    let newRowPos = rowPos
    let newColPos = colPos + (forward ? 1 : -1)
    if (newColPos >= columns.length) {
      newColPos = 0
      newRowPos += 1
    } else if (newColPos < 0) {
      newColPos = columns.length - 1
      newRowPos -= 1
    }
    if (newRowPos < 0 || newRowPos >= visualOrder.length) return null
    return { row: visualOrder[newRowPos], col: columns[newColPos] }
  }

  // Up/Down step to the same column on the row above/below, in visual order.
  function verticalTarget(dir: 1 | -1, from: { row: number; col: string }): { row: number; col: string } | null {
    const rowPos = visualOrder.indexOf(from.row)
    if (rowPos === -1) return null
    const newRowPos = rowPos + dir
    if (newRowPos < 0 || newRowPos >= visualOrder.length) return null
    return { row: visualOrder[newRowPos], col: from.col }
  }

  // Arrow-key/Enter/Tab navigation while a cell is selected but not currently being edited —
  // only active once a cell has been clicked, and stays out of the way of typing elsewhere
  // (filter inputs, dialogs) by bailing whenever focus is actually inside a text field.
  useEffect(() => {
    if (!activeCell || editingCell) return
    function handleKeyDown(e: globalThis.KeyboardEvent): void {
      const active = document.activeElement as HTMLElement | null
      const isTextInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isTextInput) return
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveActiveCell(-1, 0)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveActiveCell(1, 0)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        moveActiveCell(0, -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        moveActiveCell(0, 1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const next = tabTarget(!e.shiftKey)
        if (next) setActiveCell(next)
      } else if (e.key === 'Enter' || e.key === 'F2') {
        if (!editable || !activeCell) return
        e.preventDefault()
        const row = rows[activeCell.row]
        startEdit(activeCell.row, activeCell.col, row?.[activeCell.col])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell, editingCell, rows, columns, rowOrder, editable])

  function startEdit(rowIndex: number, col: string, value: unknown): void {
    if (!editable) return
    setEditingCell({ row: rowIndex, col })
    const kind = editorKindFor(columnTypes?.[col]?.dataType)
    if (value === SQL_DEFAULT) {
      // Re-editing a cell that's staged to reset to its column default: start from a blank
      // draft rather than showing the raw sentinel or guessing a checkbox state for it.
      setDraft('')
    } else if (kind === 'boolean') {
      const truthy = value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 't'
      setDraft(truthy ? '1' : '0')
    } else if (kind === 'date') {
      setDraft(toDateInputValue(value))
    } else if (kind === 'datetime') {
      setDraft(toDatetimeInputValue(value))
    } else {
      setDraft(value === null || value === undefined ? '' : formatCell(value))
    }
  }

  function commitEdit(rowIndex: number, col: string, originalWasNull: boolean): void {
    if (!editingCell) return
    setEditingCell(null)
    const kind = editorKindFor(columnTypes?.[col]?.dataType)
    const normalized = kind === 'datetime' ? normalizeDatetimeInputValue(draft) : draft
    onCellEdit?.(rowIndex, col, normalized === '' && originalWasNull ? null : normalized)
  }

  // Tab/Shift+Tab and Up/Down while editing: commit the current cell, then jump straight into
  // editing the next/previous one (Tab: next/prev column, wrapping rows; Up/Down: same column,
  // row above/below) — the "navigate with the keyboard to edit data" flow.
  function handleEditorNavKey(e: KeyboardEvent, rowIndex: number, col: string, originalWasNull: boolean): void {
    const from = { row: rowIndex, col }
    const next =
      e.key === 'Tab' ? tabTarget(!e.shiftKey, from)
      : e.key === 'ArrowUp' ? verticalTarget(-1, from)
      : e.key === 'ArrowDown' ? verticalTarget(1, from)
      : undefined
    if (next === undefined) return // not a nav key we handle here
    e.preventDefault()
    commitEdit(rowIndex, col, originalWasNull)
    if (!next) return // at the grid's edge — commit still happens above, just nothing to move to
    setActiveCell(next)
    startEdit(next.row, next.col, rows[next.row]?.[next.col])
  }

  function openRowMenu(e: MouseEvent, rowIndex: number): void {
    if (!hasRowMenu) return
    e.preventDefault()
    setContextMenu({ rowIndex, x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <table className="data-grid">
        <thead>
          <tr>
            <th style={{ width: 44 }}>#</th>
            {columns.map((c) => (
              <th
                key={c}
                onClick={() => onHeaderClick?.(c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setHeaderMenu({ col: c, x: e.clientX, y: e.clientY })
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {c}
                  {sortColumn === c ? (sortDir === 'DESC' ? <ChevronDown size={11} /> : <ChevronUp size={11} />) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visualOrder.map((rowIndex) => {
            const row = rows[rowIndex]
            if (!row) return null
            const markedForDeletion = pendingDeleteRows?.has(rowIndex) ?? false
            const rowClasses = [
              selectedRows?.has(rowIndex) ? 'selected' : '',
              markedForDeletion ? 'pending-delete' : ''
            ]
              .filter(Boolean)
              .join(' ')
            return (
            <tr
              key={rowIndex}
              className={rowClasses || undefined}
              onClick={(e) => onRowSelect?.(rowIndex, e)}
              onContextMenu={(e) => openRowMenu(e, rowIndex)}
            >
              <td className="row-num">
                {onDeleteRow ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRow(rowIndex)
                    }}
                    title={
                      markedForDeletion
                        ? 'Marked for deletion — click to undo (right-click for more actions)'
                        : 'Mark for deletion — takes effect on Save (right-click for more actions)'
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {markedForDeletion ? <RotateCcw size={11} style={{ verticalAlign: 'middle' }} /> : offset + rowIndex + 1}
                  </span>
                ) : (
                  offset + rowIndex + 1
                )}
              </td>
              {columns.map((col) => {
                const value = row[col]
                const editingThis = editingCell?.row === rowIndex && editingCell.col === col
                const dirty = isDirty?.(rowIndex, col) ?? false
                if (editingThis) {
                  const kind = editorKindFor(columnTypes?.[col]?.dataType)
                  if (kind === 'boolean') {
                    return (
                      <td key={col} className="editing">
                        <input
                          type="checkbox"
                          autoFocus
                          checked={draft === '1'}
                          onChange={(e) => setDraft(e.target.checked ? '1' : '0')}
                          onBlur={() => commitEdit(rowIndex, col, value === null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(rowIndex, col, value === null)
                            else if (e.key === 'Escape') setEditingCell(null)
                            else handleEditorNavKey(e, rowIndex, col, value === null)
                          }}
                        />
                      </td>
                    )
                  }
                  if (kind === 'date' || kind === 'datetime') {
                    return (
                      <td key={col} className="editing">
                        <input
                          type={kind === 'date' ? 'date' : 'datetime-local'}
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => commitEdit(rowIndex, col, value === null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(rowIndex, col, value === null)
                            else if (e.key === 'Escape') setEditingCell(null)
                            else handleEditorNavKey(e, rowIndex, col, value === null)
                          }}
                        />
                      </td>
                    )
                  }
                  return (
                    <td key={col} className="editing">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => commitEdit(rowIndex, col, value === null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(rowIndex, col, value === null)
                          else if (e.key === 'Escape') setEditingCell(null)
                          else handleEditorNavKey(e, rowIndex, col, value === null)
                        }}
                      />
                    </td>
                  )
                }
                const fk = fkByColumn.get(col)
                const isBlankish = value === null || value === SQL_DEFAULT
                const isActiveCell = activeCell?.row === rowIndex && activeCell.col === col
                return (
                  <td
                    key={col}
                    className={`${isBlankish ? 'null-value' : ''}${dirty ? ' dirty' : ''}${fk ? ' fk-cell' : ''}${isActiveCell ? ' active-cell' : ''}`}
                    onClick={() => setActiveCell({ row: rowIndex, col })}
                    onDoubleClick={() => !markedForDeletion && startEdit(rowIndex, col, value)}
                    title={formatCell(value)}
                  >
                    {fk ? (
                      <span className="fk-cell-inner">
                        <span className="cell-value">{formatCell(value)}</span>
                        {value !== null && value !== undefined && value !== SQL_DEFAULT && (
                          <button
                            type="button"
                            className="fk-jump-btn"
                            title={`Go to ${fk.refTable}.${fk.refColumn} = ${formatCell(value)}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateFk?.(rowIndex, fk)
                            }}
                          >
                            <ArrowUpRight size={11} />
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="cell-value">{formatCell(value)}</span>
                    )}
                  </td>
                )
              })}
            </tr>
            )
          })}
        </tbody>
      </table>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {onDuplicateRow && (
            <div
              className="context-menu-item"
              onClick={() => {
                onDuplicateRow(contextMenu.rowIndex)
                setContextMenu(null)
              }}
            >
              <CopyPlus size={13} /> Duplicate row
            </div>
          )}
          {onCopyRow && (
            <div
              className="context-menu-item"
              onClick={() => {
                onCopyRow(contextMenu.rowIndex)
                setContextMenu(null)
              }}
            >
              <Copy size={13} /> Copy row
            </div>
          )}
          {onPasteRow && (
            <div
              className="context-menu-item"
              onClick={() => {
                onPasteRow(contextMenu.rowIndex)
                setContextMenu(null)
              }}
            >
              <ClipboardPaste size={13} /> Paste row below
            </div>
          )}
          {onDeleteRow && (
            <div
              className="context-menu-item danger"
              onClick={() => {
                onDeleteRow(contextMenu.rowIndex)
                setContextMenu(null)
              }}
            >
              {pendingDeleteRows?.has(contextMenu.rowIndex) ? (
                <>
                  <RotateCcw size={13} /> Undo delete
                </>
              ) : (
                <>
                  <X size={13} /> Delete row (on Save)
                </>
              )}
            </div>
          )}
        </div>
      )}
      {headerMenu && (
        <div
          className="context-menu"
          style={{ top: headerMenu.y, left: headerMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              navigator.clipboard.writeText(headerMenu.col).catch(() => {})
              setHeaderMenu(null)
            }}
          >
            <Copy size={13} /> Copy column name
          </div>
          {onFilterByColumn && (
            <div
              className="context-menu-item"
              onClick={() => {
                onFilterByColumn(headerMenu.col)
                setHeaderMenu(null)
              }}
            >
              <Filter size={13} /> Filter by this column
            </div>
          )}
        </div>
      )}
    </>
  )
}
