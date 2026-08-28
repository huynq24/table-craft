import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useDdlPreview } from '../lib/useDdlPreview'
import { COMMON_TYPES, emptyColumnDraft } from '../lib/sqlTypes'
import ConfirmSqlDialog from './ConfirmSqlDialog'
import type { CreateTableColumn } from '@shared/types'

interface Props {
  connectionId: string
  onClose: () => void
}

export default function CreateTableModal({ connectionId, onClose }: Props): JSX.Element {
  const { setTables, openTab } = useAppStore()
  const [schema, setSchema] = useState('')
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<CreateTableColumn[]>([emptyColumnDraft()])
  const [error, setError] = useState<string | null>(null)
  const ddl = useDdlPreview(connectionId)

  useEffect(() => {
    window.api.db.defaultSchema(connectionId).then(setSchema)
  }, [connectionId])

  function updateColumn(i: number, patch: Partial<CreateTableColumn>): void {
    setColumns((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function addColumnRow(): void {
    setColumns((prev) => [...prev, emptyColumnDraft()])
  }

  function removeColumnRow(i: number): void {
    setColumns((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleCreate(): Promise<void> {
    setError(null)
    const name = tableName.trim()
    const validColumns = columns.filter((c) => c.name.trim())
    if (!name || validColumns.length === 0) {
      setError('Table name and at least one named column are required.')
      return
    }
    const params = { schema, table: name, columns: validColumns }
    await ddl.confirmAndRun({ kind: 'createTable', params }, async () => {
      try {
        await window.api.db.createTable({ connectionId, ...params })
        const list = await window.api.db.listTables(connectionId, schema)
        setTables(connectionId, list)
        openTab({
          id: `table-${connectionId}-${schema}-${name}`,
          connectionId,
          kind: 'table',
          title: name,
          schema,
          table: name
        })
        onClose()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        {ddl.pendingSql && (
          <ConfirmSqlDialog sql={ddl.pendingSql} running={ddl.running} onConfirm={ddl.confirm} onCancel={ddl.cancel} />
        )}
        <div className="modal-header">New Table{schema ? ` — ${schema}` : ''}</div>
        <div className="modal-body">
          <div className="field">
            <label>Table name</label>
            <input autoFocus value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="my_table" />
          </div>

          <div className="section-title" style={{ padding: '4px 0' }}>Columns</div>
          <table className="data-grid" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Nullable</th>
                <th>PK</th>
                <th>Default</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={col.name}
                      onChange={(e) => updateColumn(i, { name: e.target.value })}
                      placeholder="column_name"
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <input
                      value={col.dataType}
                      onChange={(e) => updateColumn(i, { dataType: e.target.value })}
                      list="create-table-type-options"
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <input type="checkbox" checked={col.nullable} onChange={(e) => updateColumn(i, { nullable: e.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" checked={col.primaryKey} onChange={(e) => updateColumn(i, { primaryKey: e.target.checked })} />
                  </td>
                  <td>
                    <input
                      value={col.defaultValue ?? ''}
                      onChange={(e) => updateColumn(i, { defaultValue: e.target.value || null })}
                      style={{ width: '100%', background: 'var(--bg-0)', border: '1px solid var(--border)', color: 'var(--text)', padding: 3 }}
                    />
                  </td>
                  <td>
                    <button className="icon-btn" title="Remove column" onClick={() => removeColumnRow(i)} disabled={columns.length === 1}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="create-table-type-options">
            {COMMON_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button className="btn small" onClick={addColumnRow} style={{ alignSelf: 'flex-start' }}>
            <Plus size={12} /> Add column
          </button>

          {error && <div className="error-banner">{error}</div>}
          {ddl.previewError && <div className="error-banner">{ddl.previewError}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleCreate}>
            Preview &amp; Create
          </button>
        </div>
      </div>
    </div>
  )
}
