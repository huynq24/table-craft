/// <reference types="vite/client" />

import type {
  AddColumnParams,
  AlterColumnParams,
  ConnectionConfig,
  ConnectionSummary,
  ConnectResult,
  CreateTableParams,
  DatabaseInfo,
  DeleteRowParams,
  DropColumnParams,
  DropTableParams,
  ExportParams,
  ExportRowsParams,
  ImportCsvParams,
  InsertRowParams,
  QueryHistoryEntry,
  QueryResult,
  TableDataParams,
  TableInfo,
  TableStructure,
  UpdateRowParams
} from '@shared/types'

export interface Api {
  connections: {
    list: () => Promise<ConnectionSummary[]>
    save: (config: ConnectionConfig) => Promise<ConnectionSummary>
    delete: (id: string) => Promise<void>
    getWithPassword: (id: string) => Promise<Omit<ConnectionConfig, 'password'> | undefined>
  }
  db: {
    connect: (config: ConnectionConfig) => Promise<ConnectResult>
    connectSaved: (id: string) => Promise<ConnectResult>
    disconnect: (id: string) => Promise<void>
    defaultSchema: (id: string) => Promise<string>

    listDatabases: (id: string) => Promise<DatabaseInfo[]>
    listTables: (id: string, schema: string) => Promise<TableInfo[]>
    getTableStructure: (id: string, schema: string, table: string) => Promise<TableStructure>
    getPrimaryKeyColumns: (id: string, schema: string, table: string) => Promise<string[]>

    getTableData: (params: TableDataParams) => Promise<QueryResult>
    updateRow: (params: UpdateRowParams) => Promise<void>
    insertRow: (params: InsertRowParams) => Promise<void>
    deleteRow: (params: DeleteRowParams) => Promise<void>

    runQuery: (connectionId: string, sql: string) => Promise<QueryResult>

    createTable: (params: CreateTableParams) => Promise<void>
    addColumn: (params: AddColumnParams) => Promise<void>
    alterColumn: (params: AlterColumnParams) => Promise<void>
    dropColumn: (params: DropColumnParams) => Promise<void>
    dropTable: (params: DropTableParams) => Promise<void>

    exportTable: (params: ExportParams) => Promise<{ ok: boolean; filePath?: string; rowCount?: number }>
    exportRows: (params: ExportRowsParams) => Promise<{ ok: boolean; filePath?: string; rowCount?: number }>
    pickImportFile: () => Promise<string | undefined>
    importCsv: (params: ImportCsvParams) => Promise<{ inserted: number; failed: number; total: number }>
  }
  history: {
    list: (connectionId?: string) => Promise<QueryHistoryEntry[]>
    remove: (id: string) => Promise<void>
    clear: (connectionId?: string) => Promise<void>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
