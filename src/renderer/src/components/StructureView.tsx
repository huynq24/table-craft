import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import type { ColumnInfo, CreateTableColumn, ForeignKeyInfo, IndexInfo, TableStructure } from '@shared/types'

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

interface IndexDraft {
  name: string
  columns: string[]
  unique: boolean
}

function emptyIndexDraft(): IndexDraft {
  return { name: '', columns: [], unique: false }
}

interface ForeignKeyDraft {
  name: string
  column: string
  refTable: string
  refColumn: string
}

function emptyFkDraft(): ForeignKeyDraft {
  return { name: '', column: '', refTable: '', refColumn: '' }
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
  const [addingIndex, setAddingIndex] = useState(false)
  const [indexDraft, setIndexDraft] = useState<IndexDraft>(emptyIndexDraft())
  const [editingIndex, setEditingIndex] = useState<string | null>(null)
  const [editIndexDraft, setEditIndexDraft] = useState<IndexDraft>(emptyIndexDraft())
  const [addingFk, setAddingFk] = useState(false)
  const [fkDraft, setFkDraft] = useState<ForeignKeyDraft>(emptyFkDraft())
  const [editingFk, setEditingFk] = useState<string | null>(null)
  const [editFkDraft, setEditFkDraft] = useState<ForeignKeyDraft>(emptyFkDraft())

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
    setAddingIndex(false)
    setEditingIndex(null)
    setAddingFk(false)
    setEditingFk(null)
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

  async function handleAddIndex(): Promise<void> {
    if (!indexDraft.name.trim() || indexDraft.columns.length === 0) return
    setError(null)
    try {
      await window.api.db.addIndex({
        connectionId,
        schema,
        table,
        name: indexDraft.name,
        columns: indexDraft.columns,
        unique: indexDraft.unique
      })
      setAddingIndex(false)
      setIndexDraft(emptyIndexDraft())
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function startEditIndex(index: IndexInfo): void {
    setEditingIndex(index.name)
    setEditIndexDraft({ name: index.name, columns: index.columns, unique: index.unique })
  }

  async function handleSaveEditIndex(original: IndexInfo): Promise<void> {
    if (!editIndexDraft.name.trim() || editIndexDraft.columns.length === 0) return
    setError(null)
    try {
      await window.api.db.alterIndex({ connectionId, schema, table, original, updated: editIndexDraft })
      setEditingIndex(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDropIndex(index: IndexInfo): Promise<void> {
    if (!confirm(`Drop index "${index.name}"?`)) return
    setError(null)
    try {
      await window.api.db.dropIndex({ connectionId, schema, table, index })
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleAddForeignKey(): Promise<void> {
    if (!fkDraft.name.trim() || !fkDraft.column || !fkDraft.refTable.trim() || !fkDraft.refColumn.trim()) return
    setError(null)
    try {
      await window.api.db.addForeignKey({ connectionId, schema, table, ...fkDraft })
      setAddingFk(false)
      setFkDraft(emptyFkDraft())
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function startEditFk(fk: ForeignKeyInfo): void {
    setEditingFk(fk.name)
    setEditFkDraft({ name: fk.name, column: fk.column, refTable: fk.refTable, refColumn: fk.refColumn })
  }

  async function handleSaveEditFk(original: ForeignKeyInfo): Promise<void> {
    if (!editFkDraft.name.trim() || !editFkDraft.column || !editFkDraft.refTable.trim() || !editFkDraft.refColumn.trim()) return
    setError(null)
    try {
      await window.api.db.alterForeignKey({ connectionId, schema, table, original, updated: editFkDraft })
      setEditingFk(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDropForeignKey(fk: ForeignKeyInfo): Promise<void> {
    if (!confirm(`Drop foreign key "${fk.name}"?`)) return
    setError(null)
    try {
      await window.api.db.dropForeignKey({ connectionId, schema, table, name: fk.name })
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
    <div data-search-container="structure-columns" style={{ flex: 1, overflow: 'auto' }}>
      {error && <div className="error-banner" style={{ margin: 8 }}>{error}</div>}

      <div className="structure-toolbar">
        <button className="btn small primary" onClick={() => setAddingColumn(true)}>
          + Add Column
        </button>
        <input
          className="filter-input"
          data-search-input
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

      <div className="structure-toolbar">
        <div className="section-title" style={{ margin: 0 }}>Indexes</div>
        <button className="btn small primary" onClick={() => setAddingIndex(true)}>
          + Add Index
        </button>
      </div>
      <table className="data-grid" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Columns</th>
            <th>Unique</th>
            <th>Primary</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {structure?.indexes.map((idx) => {
            const isEditing = editingIndex === idx.name
            if (isEditing) {
              return (
                <tr key={idx.name}>
                  <td>
                    <input
                      value={editIndexDraft.name}
                      onChange={(e) => setEditIndexDraft({ ...editIndexDraft, name: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <select
                      multiple
                      value={editIndexDraft.columns}
                      onChange={(e) =>
                        setEditIndexDraft({
                          ...editIndexDraft,
                          columns: Array.from(e.target.selectedOptions).map((o) => o.value)
                        })
                      }
                      style={{ width: '100%', minHeight: 56, background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    >
                      {structure?.columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={editIndexDraft.unique}
                      onChange={(e) => setEditIndexDraft({ ...editIndexDraft, unique: e.target.checked })}
                    />
                  </td>
                  <td>{idx.primary ? 'YES' : 'NO'}</td>
                  <td>
                    <button className="btn small primary" onClick={() => handleSaveEditIndex(idx)}>
                      Save
                    </button>
                    <button className="btn small" onClick={() => setEditingIndex(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            }
            return (
              <tr key={idx.name}>
                <td>{idx.name}</td>
                <td>{idx.columns.join(', ')}</td>
                <td>{idx.unique ? 'YES' : 'NO'}</td>
                <td>{idx.primary ? 'YES' : 'NO'}</td>
                <td>
                  <button className="btn small" onClick={() => startEditIndex(idx)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => handleDropIndex(idx)}>
                    Drop
                  </button>
                </td>
              </tr>
            )
          })}
          {structure?.indexes.length === 0 && !addingIndex && (
            <tr>
              <td colSpan={5} style={{ color: 'var(--text-dim)' }}>
                No indexes
              </td>
            </tr>
          )}
          {addingIndex && (
            <tr>
              <td>
                <input
                  autoFocus
                  value={indexDraft.name}
                  onChange={(e) => setIndexDraft({ ...indexDraft, name: e.target.value })}
                  placeholder="index_name"
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                />
              </td>
              <td>
                <select
                  multiple
                  value={indexDraft.columns}
                  onChange={(e) =>
                    setIndexDraft({
                      ...indexDraft,
                      columns: Array.from(e.target.selectedOptions).map((o) => o.value)
                    })
                  }
                  style={{ width: '100%', minHeight: 56, background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {structure?.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={indexDraft.unique}
                  onChange={(e) => setIndexDraft({ ...indexDraft, unique: e.target.checked })}
                />
              </td>
              <td />
              <td>
                <button className="btn small primary" onClick={handleAddIndex}>
                  Add
                </button>
                <button className="btn small" onClick={() => { setAddingIndex(false); setIndexDraft(emptyIndexDraft()) }}>
                  Cancel
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="structure-toolbar">
        <div className="section-title" style={{ margin: 0 }}>Foreign Keys</div>
        <button className="btn small primary" onClick={() => setAddingFk(true)}>
          + Add Foreign Key
        </button>
      </div>
      <table className="data-grid" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Column</th>
            <th>References</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {structure?.foreignKeys.map((fk) => {
            const isEditing = editingFk === fk.name
            if (isEditing) {
              return (
                <tr key={fk.name}>
                  <td>
                    <input
                      value={editFkDraft.name}
                      onChange={(e) => setEditFkDraft({ ...editFkDraft, name: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <select
                      value={editFkDraft.column}
                      onChange={(e) => setEditFkDraft({ ...editFkDraft, column: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    >
                      <option value="">Select column…</option>
                      {structure?.columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        value={editFkDraft.refTable}
                        onChange={(e) => setEditFkDraft({ ...editFkDraft, refTable: e.target.value })}
                        placeholder="ref_table"
                        style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                      />
                      <span>.</span>
                      <input
                        value={editFkDraft.refColumn}
                        onChange={(e) => setEditFkDraft({ ...editFkDraft, refColumn: e.target.value })}
                        placeholder="ref_column"
                        style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                      />
                    </div>
                  </td>
                  <td>
                    <button className="btn small primary" onClick={() => handleSaveEditFk(fk)}>
                      Save
                    </button>
                    <button className="btn small" onClick={() => setEditingFk(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            }
            return (
              <tr key={fk.name}>
                <td>{fk.name}</td>
                <td>{fk.column}</td>
                <td>
                  {fk.refTable}.{fk.refColumn}
                </td>
                <td>
                  <button className="btn small" onClick={() => startEditFk(fk)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => handleDropForeignKey(fk)}>
                    Drop
                  </button>
                </td>
              </tr>
            )
          })}
          {structure?.foreignKeys.length === 0 && !addingFk && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--text-dim)' }}>
                No foreign keys
              </td>
            </tr>
          )}
          {addingFk && (
            <tr>
              <td>
                <input
                  autoFocus
                  value={fkDraft.name}
                  onChange={(e) => setFkDraft({ ...fkDraft, name: e.target.value })}
                  placeholder="fk_name"
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                />
              </td>
              <td>
                <select
                  value={fkDraft.column}
                  onChange={(e) => setFkDraft({ ...fkDraft, column: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                >
                  <option value="">Select column…</option>
                  {structure?.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    value={fkDraft.refTable}
                    onChange={(e) => setFkDraft({ ...fkDraft, refTable: e.target.value })}
                    placeholder="ref_table"
                    style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                  />
                  <span>.</span>
                  <input
                    value={fkDraft.refColumn}
                    onChange={(e) => setFkDraft({ ...fkDraft, refColumn: e.target.value })}
                    placeholder="ref_column"
                    style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                  />
                </div>
              </td>
              <td>
                <button className="btn small primary" onClick={handleAddForeignKey}>
                  Add
                </button>
                <button className="btn small" onClick={() => { setAddingFk(false); setFkDraft(emptyFkDraft()) }}>
                  Cancel
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
