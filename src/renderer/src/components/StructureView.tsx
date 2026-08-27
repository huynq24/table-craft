import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { ColumnInfo, CreateTableColumn, TableStructure } from '@shared/types'

interface Props {
  connectionId: string
  schema: string
  table: string
  onChanged?: () => void
  /** Bump this number to force a re-fetch of the structure (e.g. on Ctrl+R). */
  refreshSignal?: number
}

const COMMON_TYPES = [
  'INT',
  'BIGINT',
  'VARCHAR(255)',
  'TEXT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'DECIMAL(10,2)',
  'FLOAT',
  'JSON'
]

function emptyDraft(): CreateTableColumn {
  return { name: '', dataType: 'VARCHAR(255)', nullable: true, primaryKey: false, defaultValue: null }
}

export default function StructureView({ connectionId, schema, table, onChanged, refreshSignal }: Props): JSX.Element {
  const [structure, setStructure] = useState<TableStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [draft, setDraft] = useState<CreateTableColumn>(emptyDraft())
  const [editingCol, setEditingCol] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CreateTableColumn>(emptyDraft())
  const [columnSearch, setColumnSearch] = useState('')

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const s = await window.api.db.getTableStructure(connectionId, schema, table)
      setStructure(s)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    setAddingColumn(false)
    setEditingCol(null)
    setColumnSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, schema, table, refreshSignal])

  async function handleAddColumn(): Promise<void> {
    if (!draft.name.trim()) return
    setError(null)
    try {
      await window.api.db.addColumn({ connectionId, schema, table, column: draft })
      setAddingColumn(false)
      setDraft(emptyDraft())
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function startEdit(col: ColumnInfo): void {
    setEditingCol(col.name)
    setEditDraft({
      name: col.name,
      dataType: col.dataType,
      nullable: col.nullable,
      primaryKey: col.isPrimaryKey,
      defaultValue: col.defaultValue
    })
  }

  async function handleSaveEdit(original: ColumnInfo): Promise<void> {
    setError(null)
    try {
      await window.api.db.alterColumn({ connectionId, schema, table, original, updated: editDraft })
      setEditingCol(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDropColumn(name: string): Promise<void> {
    if (!confirm(`Drop column "${name}"?`)) return
    setError(null)
    try {
      await window.api.db.dropColumn({ connectionId, schema, table, column: name })
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const visibleColumns = structure
    ? structure.columns.filter((c) => c.name.toLowerCase().includes(columnSearch.trim().toLowerCase()))
    : []

  if (loading && !structure) return <div className="empty-state">Loading structure…</div>

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {error && <div className="error-banner" style={{ margin: 8 }}>{error}</div>}

      <div className="structure-toolbar">
        <button className="btn small primary" onClick={() => setAddingColumn(true)}>
          + Add Column
        </button>
        <input
          className="filter-input"
          style={{ maxWidth: 220 }}
          placeholder="Search columns by name…"
          value={columnSearch}
          onChange={(e) => setColumnSearch(e.target.value)}
        />
      </div>

      <div className="section-title">
        Columns
        {columnSearch.trim() && structure ? ` (${visibleColumns.length}/${structure.columns.length})` : ''}
      </div>
      <table className="data-grid" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>Default</th>
            <th>PK</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleColumns.map((col) => {
            const isEditing = editingCol === col.name
            if (isEditing) {
              return (
                <tr key={col.name}>
                  <td>
                    <input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.dataType}
                      onChange={(e) => setEditDraft({ ...editDraft, dataType: e.target.value })}
                      list="type-options"
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={editDraft.nullable}
                      onChange={(e) => setEditDraft({ ...editDraft, nullable: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      value={editDraft.defaultValue ?? ''}
                      onChange={(e) => setEditDraft({ ...editDraft, defaultValue: e.target.value || null })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>{col.isPrimaryKey ? <KeyRound size={12} style={{ color: 'var(--yellow)' }} /> : ''}</td>
                  <td>
                    <button className="btn small primary" onClick={() => handleSaveEdit(col)}>
                      Save
                    </button>
                    <button className="btn small" onClick={() => setEditingCol(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            }
            return (
              <tr key={col.name}>
                <td>{col.name}</td>
                <td>{col.dataType}</td>
                <td>{col.nullable ? 'YES' : 'NO'}</td>
                <td className={col.defaultValue === null ? 'null-value' : ''}>{col.defaultValue ?? 'NULL'}</td>
                <td>{col.isPrimaryKey ? <KeyRound size={12} style={{ color: 'var(--yellow)' }} /> : ''}</td>
                <td>
                  <button className="btn small" onClick={() => startEdit(col)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => handleDropColumn(col.name)}>
                    Drop
                  </button>
                </td>
              </tr>
            )
          })}
          {visibleColumns.length === 0 && structure && structure.columns.length > 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--text-dim)' }}>
                No columns found matching "{columnSearch}"
              </td>
            </tr>
          )}
          {addingColumn && (
            <tr>
              <td>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="column_name"
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                />
              </td>
              <td>
                <input
                  value={draft.dataType}
                  onChange={(e) => setDraft({ ...draft, dataType: e.target.value })}
                  list="type-options"
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={draft.nullable}
                  onChange={(e) => setDraft({ ...draft, nullable: e.target.checked })}
                />
              </td>
              <td>
                <input
                  value={draft.defaultValue ?? ''}
                  onChange={(e) => setDraft({ ...draft, defaultValue: e.target.value || null })}
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                />
              </td>
              <td />
              <td>
                <button className="btn small primary" onClick={handleAddColumn}>
                  Add
                </button>
                <button className="btn small" onClick={() => setAddingColumn(false)}>
                  Cancel
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <datalist id="type-options">
        {COMMON_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="section-title">Indexes</div>
      <table className="data-grid" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Columns</th>
            <th>Unique</th>
            <th>Primary</th>
          </tr>
        </thead>
        <tbody>
          {structure?.indexes.map((idx) => (
            <tr key={idx.name}>
              <td>{idx.name}</td>
              <td>{idx.columns.join(', ')}</td>
              <td>{idx.unique ? 'YES' : 'NO'}</td>
              <td>{idx.primary ? 'YES' : 'NO'}</td>
            </tr>
          ))}
          {structure?.indexes.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--text-dim)' }}>
                No indexes
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="section-title">Foreign Keys</div>
      <table className="data-grid" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Column</th>
            <th>References</th>
          </tr>
        </thead>
        <tbody>
          {structure?.foreignKeys.map((fk) => (
            <tr key={fk.name}>
              <td>{fk.name}</td>
              <td>{fk.column}</td>
              <td>
                {fk.refTable}.{fk.refColumn}
              </td>
            </tr>
          ))}
          {structure?.foreignKeys.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: 'var(--text-dim)' }}>
                No foreign keys
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
