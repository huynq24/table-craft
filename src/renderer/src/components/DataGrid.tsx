import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ChevronUp, ChevronDown, RotateCcw, CopyPlus, Copy, ClipboardPaste, X, ArrowUpRight } from 'lucide-react'
import type { ColumnInfo, ForeignKeyInfo } from '@shared/types'

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
  if (v === null || v === undefined) return ''
  const raw = String(v instanceof Date ? v.toISOString() : v)
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return raw.slice(0, 10)
}

/** `<input type="datetime-local">` needs `YYYY-MM-DDTHH:mm`. */
function toDatetimeInputValue(v: unknown): string {
  if (v === null || v === undefined) return ''
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

export function formatCell(v: unknown): string {
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
    if (!contextMenu) return
    function close(): void {
      setContextMenu(null)
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
  }, [contextMenu])

  function startEdit(rowIndex: number, col: string, value: unknown): void {
    if (!editable) return
    setEditingCell({ row: rowIndex, col })
    const kind = editorKindFor(columnTypes?.[col]?.dataType)
    if (kind === 'boolean') {
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
              <th key={c} onClick={() => onHeaderClick?.(c)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {c}
                  {sortColumn === c ? (sortDir === 'DESC' ? <ChevronDown size={11} /> : <ChevronUp size={11} />) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rowOrder ?? rows.map((_, i) => i)).map((rowIndex) => {
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
                            if (e.key === 'Escape') setEditingCell(null)
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
                          onBlur={() => commitEdit(rowIndex, col, value === null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(rowIndex, col, value === null)
                            if (e.key === 'Escape') setEditingCell(null)
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
                        onBlur={() => commitEdit(rowIndex, col, value === null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(rowIndex, col, value === null)
                          if (e.key === 'Escape') setEditingCell(null)
                        }}
                      />
                    </td>
                  )
                }
                const fk = fkByColumn.get(col)
                return (
                  <td
                    key={col}
                    className={`${value === null ? 'null-value' : ''}${dirty ? ' dirty' : ''}${fk ? ' fk-cell' : ''}`}
                    onDoubleClick={() => !markedForDeletion && startEdit(rowIndex, col, value)}
                    title={formatCell(value)}
                  >
                    {fk ? (
                      <span className="fk-cell-inner">
                        <span className="cell-value">{formatCell(value)}</span>
                        {value !== null && value !== undefined && (
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
    </>
  )
}
