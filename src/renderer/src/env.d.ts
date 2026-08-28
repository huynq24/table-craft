/// <reference types="vite/client" />

import type {
  AddColumnParams,
  AddForeignKeyParams,
  AddIndexParams,
  AlterColumnParams,
  AlterForeignKeyParams,
  AlterIndexParams,
  ConnectionConfig,
  ConnectionGroup,
  ConnectionSummary,
  ConnectResult,
  CreateTableParams,
  DatabaseInfo,
  DeleteRowParams,
  DropColumnParams,
  DropForeignKeyParams,
  DropIndexParams,
  DropTableParams,
  ExportParams,
  ExportRowsParams,
  ImportCsvParams,
  InsertRowParams,
  PreviewDdlParams,
  QueryHistoryEntry,
  QueryResult,
  QuerySnippet,
  RoutineInfo,
  RoutineType,
  TableDataParams,
  TableInfo,
  TableStructure,
  TriggerInfo,
  UpdateRowParams
} from '@shared/types'

export interface Api {
  connections: {
    list: () => Promise<ConnectionSummary[]>
    save: (config: ConnectionConfig) => Promise<ConnectionSummary>
    delete: (id: string) => Promise<void>
    getWithPassword: (id: string) => Promise<Omit<ConnectionConfig, 'password'> | undefined>
    listGroups: () => Promise<ConnectionGroup[]>
    saveGroup: (group: ConnectionGroup) => Promise<ConnectionGroup>
    deleteGroup: (id: string) => Promise<void>
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

    addIndex: (params: AddIndexParams) => Promise<void>
    dropIndex: (params: DropIndexParams) => Promise<void>
    alterIndex: (params: AlterIndexParams) => Promise<void>
    addForeignKey: (params: AddForeignKeyParams) => Promise<void>
    dropForeignKey: (params: DropForeignKeyParams) => Promise<void>
    alterForeignKey: (params: AlterForeignKeyParams) => Promise<void>

    previewDdl: (params: PreviewDdlParams) => Promise<string[]>

    listTriggers: (id: string, schema: string) => Promise<TriggerInfo[]>
    getTriggerDefinition: (id: string, schema: string, name: string) => Promise<string>
    saveTrigger: (id: string, schema: string, sql: string) => Promise<void>
    dropTrigger: (id: string, schema: string, name: string, table: string) => Promise<void>

    listRoutines: (id: string, schema: string) => Promise<RoutineInfo[]>
    getRoutineDefinition: (id: string, schema: string, name: string, type: RoutineType) => Promise<string>
    saveRoutine: (id: string, schema: string, sql: string) => Promise<void>
    dropRoutine: (id: string, schema: string, name: string, type: RoutineType) => Promise<void>

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
  snippets: {
    list: (connectionId?: string) => Promise<QuerySnippet[]>
    save: (snippet: Omit<QuerySnippet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<QuerySnippet>
    remove: (id: string) => Promise<void>
  }
  system: {
    pickTextFile: () => Promise<string | undefined>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
