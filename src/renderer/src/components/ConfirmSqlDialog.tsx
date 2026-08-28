import { TriangleAlert } from 'lucide-react'

interface Props {
  sql: string[]
  running?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Shown before any schema-mutating operation (add/alter/drop column|index|FK, create/drop
 *  table, save/drop trigger|routine) actually executes — see `useDdlPreview`. */
export default function ConfirmSqlDialog({ sql, running, onConfirm, onCancel }: Props): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TriangleAlert size={15} style={{ color: 'var(--yellow)' }} />
          Review SQL before running
        </div>
        <div className="modal-body">
          {sql.map((stmt, i) => (
            <pre
              key={i}
              style={{
                margin: 0,
                padding: 10,
                background: 'var(--bg-0)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'var(--mono)',
                fontSize: 12.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--text)'
              }}
            >
              {stmt}
            </pre>
          ))}
          {sql.length === 0 && <div className="status-text">Nothing to run.</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel} disabled={running}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm} disabled={running || sql.length === 0}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}
