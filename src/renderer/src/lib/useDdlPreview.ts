import { useState } from 'react'
import type { DdlOperation } from '@shared/types'

interface PendingConfirm {
  sql: string[]
  /** Runs the real mutation IPC + whatever follow-up (reload, close editor, …) the caller needs.
   *  Expected to handle/report its own errors — this hook just decides when to run it. */
  onConfirm: () => Promise<void>
}

/**
 * Every structural change (add/alter/drop column|index|foreign key, create/drop table, save/drop
 * trigger|routine) routes through this: fetch the SQL the operation would run via `db:previewDdl`,
 * show it in a confirm dialog, and only run the real mutation once the user confirms.
 */
export function useDdlPreview(connectionId: string): {
  pendingSql: string[] | null
  previewError: string | null
  running: boolean
  confirmAndRun: (operation: DdlOperation, execute: () => Promise<void>) => Promise<void>
  confirm: () => Promise<void>
  cancel: () => void
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [running, setRunning] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function confirmAndRun(operation: DdlOperation, execute: () => Promise<void>): Promise<void> {
    setPreviewError(null)
    try {
      const sql = await window.api.db.previewDdl({ connectionId, operation })
      setPending({ sql, onConfirm: execute })
    } catch (err) {
      setPreviewError((err as Error).message)
    }
  }

  async function confirm(): Promise<void> {
    if (!pending) return
    setRunning(true)
    try {
      await pending.onConfirm()
    } finally {
      setRunning(false)
      setPending(null)
    }
  }

  function cancel(): void {
    setPending(null)
  }

  return { pendingSql: pending?.sql ?? null, previewError, running, confirmAndRun, confirm, cancel }
}
