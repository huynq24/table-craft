import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import Papa from 'papaparse'
import type {
  AddColumnParams,
  AlterColumnParams,
  ConnectionConfig,
  CreateTableParams,
  DeleteRowParams,
  DropColumnParams,
  DropTableParams,
  ExportParams,
  ExportRowsParams,
  ImportCsvParams,
  InsertRowParams,
  TableDataParams,
  UpdateRowParams
} from '@shared/types'
import { connectionManager } from './db/connectionManager'
import { connectionStore } from './store'
import { queryHistoryStore } from './historyStore'

/** Shared "pick a file, write rows as CSV/JSON" flow used by both export IPC handlers. */
async function saveRowsToFile(
  rows: Record<string, unknown>[],
  format: 'csv' | 'json',
  defaultName: string
): Promise<{ ok: boolean; filePath?: string; rowCount?: number }> {
  const win = BrowserWindow.getFocusedWindow()
  const saveOptions = {
    defaultPath: `${defaultName}.${format}`,
    filters: format === 'csv' ? [{ name: 'CSV', extensions: ['csv'] }] : [{ name: 'JSON', extensions: ['json'] }]
  }
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, saveOptions)
    : await dialog.showSaveDialog(saveOptions)
  if (canceled || !filePath) return { ok: false }

  if (format === 'csv') {
    writeFileSync(filePath, Papa.unparse(rows), 'utf-8')
  } else {
    writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8')
  }
  return { ok: true, filePath, rowCount: rows.length }
}

export function registerIpcHandlers(): void {
  // --- Saved connections (config only, no live connection) ---
  ipcMain.handle('connections:list', () => connectionStore.list())

  ipcMain.handle('connections:save', (_e, config: ConnectionConfig) => connectionStore.upsert(config))

  ipcMain.handle('connections:delete', async (_e, id: string) => {
    await connectionManager.disconnect(id)
    connectionStore.remove(id)
  })

  ipcMain.handle('connections:getWithPassword', (_e, id: string) => {
    const cfg = connectionStore.getWithPassword(id)
    if (!cfg) return undefined
    const { password, ...rest } = cfg
    return rest
  })

  // --- Live connection lifecycle ---
  ipcMain.handle('db:connect', async (_e, config: ConnectionConfig) => {
    try {
      await connectionManager.connect(config)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('db:connectSaved', async (_e, id: string) => {
    const cfg = connectionStore.getWithPassword(id)
    if (!cfg) return { ok: false, error: 'Connection not found' }
    try {
      await connectionManager.connect(cfg)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('db:disconnect', async (_e, id: string) => {
    await connectionManager.disconnect(id)
  })

  ipcMain.handle('db:defaultSchema', (_e, id: string) => {
    const cfg = connectionManager.getConfig(id)
    return cfg ? connectionManager.get(id).defaultSchema(cfg) : ''
  })

  // --- Schema browsing ---
  ipcMain.handle('db:listDatabases', (_e, id: string) => connectionManager.get(id).listDatabases())

  ipcMain.handle('db:listTables', (_e, id: string, schema: string) =>
    connectionManager.get(id).listTables(schema)
  )

  ipcMain.handle('db:getTableStructure', (_e, id: string, schema: string, table: string) =>
    connectionManager.get(id).getTableStructure(schema, table)
  )

  ipcMain.handle('db:getPrimaryKeyColumns', (_e, id: string, schema: string, table: string) =>
    connectionManager.get(id).getPrimaryKeyColumns(schema, table)
  )

  // --- Data ---
  ipcMain.handle('db:getTableData', (_e, params: TableDataParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).getTableData(rest)
  })

  ipcMain.handle('db:updateRow', (_e, params: UpdateRowParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).updateRow(rest)
  })

  ipcMain.handle('db:insertRow', (_e, params: InsertRowParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).insertRow(rest)
  })

  ipcMain.handle('db:deleteRow', (_e, params: DeleteRowParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).deleteRow(rest)
  })

  ipcMain.handle('db:runQuery', async (_e, connectionId: string, sql: string) => {
    const result = await connectionManager.get(connectionId).runQuery(sql)
    queryHistoryStore.add({
      connectionId,
      sql,
      ranAt: new Date().toISOString(),
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      error: result.error
    })
    return result
  })

  // --- Query history ---
  ipcMain.handle('history:list', (_e, connectionId?: string) => queryHistoryStore.list(connectionId))
  ipcMain.handle('history:remove', (_e, id: string) => queryHistoryStore.remove(id))
  ipcMain.handle('history:clear', (_e, connectionId?: string) => queryHistoryStore.clear(connectionId))

  // --- Schema mutation ---
  ipcMain.handle('db:createTable', (_e, params: CreateTableParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).createTable(rest)
  })

  ipcMain.handle('db:addColumn', (_e, params: AddColumnParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).addColumn(rest)
  })

  ipcMain.handle('db:alterColumn', (_e, params: AlterColumnParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).alterColumn(rest)
  })

  ipcMain.handle('db:dropColumn', (_e, params: DropColumnParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).dropColumn(rest)
  })

  ipcMain.handle('db:dropTable', (_e, params: DropTableParams) => {
    const { connectionId, ...rest } = params
    return connectionManager.get(connectionId).dropTable(rest)
  })

  // --- Export ---
  ipcMain.handle('db:exportTable', async (_e, params: ExportParams) => {
    const { connectionId, schema, table, format, filter } = params
    const adapter = connectionManager.get(connectionId)
    const result = await adapter.getTableData({ schema, table, limit: 1000000, offset: 0, filter })
    return saveRowsToFile(result.rows, format, table)
  })

  // Exports rows the renderer already has in hand (e.g. a SQL query's result set),
  // without re-querying the database.
  ipcMain.handle('db:exportRows', async (_e, params: ExportRowsParams) => {
    const { rows, format, suggestedName } = params
    return saveRowsToFile(rows, format, suggestedName || 'query_result')
  })

  ipcMain.handle('db:pickImportFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const openOptions = {
      properties: ['openFile' as const],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions)
    if (canceled || !filePaths[0]) return undefined
    return filePaths[0]
  })

  ipcMain.handle('db:importCsv', async (_e, params: ImportCsvParams) => {
    const { connectionId, schema, table, filePath } = params
    const adapter = connectionManager.get(connectionId)
    const content = readFileSync(filePath, 'utf-8')
    const parsed = Papa.parse<Record<string, unknown>>(content, { header: true, dynamicTyping: true, skipEmptyLines: true })
    let inserted = 0
    let failed = 0
    for (const row of parsed.data) {
      try {
        await adapter.insertRow({ schema, table, values: row })
        inserted++
      } catch {
        failed++
      }
    }
    return { inserted, failed, total: parsed.data.length }
  })
}
