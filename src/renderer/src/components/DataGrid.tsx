import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ChevronUp, ChevronDown, RotateCcw, CopyPlus, Copy, ClipboardPaste, X, ArrowUpRight } from 'lucide-react'
import type { ForeignKeyInfo } from '@shared/types'

export interface DataGridProps {
  columns: string[]
  rows: Record<string, unknown>[]
  editable?: boolean
  isDirty?: (rowIndex: number, col: string) => boolean
  onCellEdit?: (rowIndex: number, col: string, value: string | null) => void
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
  onNavigateFk
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
    setDraft(value === null || value === undefined ? '' : formatCell(value))
  }

  function commitEdit(rowIndex: number, col: string, originalWasNull: boolean): void {
    if (!editingCell) return
    setEditingCell(null)
    onCellEdit?.(rowIndex, col, draft === '' && originalWasNull ? null : draft)
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
