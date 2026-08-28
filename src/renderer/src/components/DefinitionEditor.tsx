import { useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { MySQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Tab } from '../store/appStore'
import { useAppStore } from '../store/appStore'
import { useThemeStore } from '../store/themeStore'
import ConfirmSqlDialog from './ConfirmSqlDialog'

interface Props {
  tab: Tab
}

function triggerTemplate(schema: string): string {
  return `-- CREATE TRIGGER my_trigger\n-- BEFORE INSERT ON ${schema}.my_table\n-- FOR EACH ROW\n-- BEGIN\n--   ...\n-- END;\n`
}

function routineTemplate(schema: string, kind: 'procedure' | 'function'): string {
  return kind === 'function'
    ? `-- CREATE FUNCTION ${schema}.my_function(...) RETURNS ...\n-- BEGIN\n--   ...\n-- END;\n`
    : `-- CREATE PROCEDURE ${schema}.my_procedure(...)\n-- BEGIN\n--   ...\n-- END;\n`
}

/** Editor for a trigger's or a stored procedure/function's raw SQL definition — used for both
 *  creating a new one and viewing/editing an existing one (tab.kind 'trigger' | 'routine'). */
export default function DefinitionEditor({ tab }: Props): JSX.Element {
  const { connectionId, schema = '', objectName: name = '', table: attachedTable, isNew, routineType } = tab
  const { closeTab } = useAppStore()
  const driver = useAppStore((s) => s.savedConnections.find((c) => c.id === connectionId)?.driver)
  const appTheme = useThemeStore((s) => s.theme)
  const dialect = driver === 'mysql' ? MySQL : PostgreSQL

  const [text, setText] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) {
      setText(tab.kind === 'trigger' ? triggerTemplate(schema) : routineTemplate(schema, routineType ?? 'procedure'))
      return
    }
    setLoading(true)
    const fetchDef =
      tab.kind === 'trigger'
        ? window.api.db.getTriggerDefinition(connectionId, schema, name)
        : window.api.db.getRoutineDefinition(connectionId, schema, name, routineType ?? 'procedure')
    fetchDef
      .then(setText)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, schema, name, tab.kind, isNew])

  async function doSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      if (tab.kind === 'trigger') await window.api.db.saveTrigger(connectionId, schema, text)
      else await window.api.db.saveRoutine(connectionId, schema, text)
      setConfirming(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDrop(): Promise<void> {
    if (isNew) return
    const label = tab.kind === 'trigger' ? `trigger "${name}"` : `${routineType ?? 'routine'} "${name}"`
    if (!confirm(`Drop ${label}? This cannot be undone.`)) return
    try {
      if (tab.kind === 'trigger') await window.api.db.dropTrigger(connectionId, schema, name, attachedTable ?? '')
      else await window.api.db.dropRoutine(connectionId, schema, name, routineType ?? 'procedure')
      closeTab(tab.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (loading) return <div className="empty-state">Loading definition…</div>

  return (
    <div className="query-pane">
      {confirming && (
        <ConfirmSqlDialog sql={[text]} running={saving} onConfirm={doSave} onCancel={() => setConfirming(false)} />
      )}
      <div className="toolbar">
        <button className="btn small primary" onClick={() => setConfirming(true)} disabled={!text.trim()}>
          <Save size={12} /> Save
        </button>
        {!isNew && (
          <button className="btn small danger" onClick={handleDrop}>
            <Trash2 size={12} /> Drop
          </button>
        )}
        <span className="status-text">
          {tab.kind === 'trigger' ? 'Trigger' : routineType === 'function' ? 'Function' : 'Procedure'}: {name || '(unsaved)'}
        </span>
      </div>
      {error && <div className="error-banner" style={{ margin: 8 }}>{error}</div>}
      <div className="query-editor-wrap" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CodeMirror
          value={text}
          height="100%"
          theme={appTheme === 'dark' ? oneDark : 'light'}
          basicSetup={{ autocompletion: true }}
          extensions={[sql({ dialect, upperCaseKeywords: true })]}
          onChange={(val) => setText(val)}
        />
      </div>
    </div>
  )
}
