// Shared types used by both the main (Node/Electron) process and the renderer (React) UI.

export type DriverType = 'mysql' | 'postgres'

export interface ConnectionConfig {
  id: string
  name: string
  driver: DriverType
  host: string
  port: number
  user: string
  /** Never sent back to renderer in list calls; only used when connecting. */
  password: string
  database: string
  ssl: boolean
  color?: string
}

/** Connection config as persisted/listed, without the password. */
export type ConnectionSummary = Omit<ConnectionConfig, 'password'>

export interface ConnectResult {
  ok: boolean
  error?: string
}

export interface DatabaseInfo {
  name: string
}

export interface TableInfo {
  name: string
  schema: string
  type: 'table' | 'view'
  rowCountEstimate?: number
}

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
  maxLength: number | null
  extra?: string
}

export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  primary: boolean
}

export interface ForeignKeyInfo {
  name: string
  column: string
  refTable: string
  refColumn: string
}

export interface TableStructure {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  affectedRows?: number
  durationMs: number
  error?: string
}

export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IS NULL' | 'IS NOT NULL'

export interface FilterCondition {
  column: string
  operator: FilterOperator
  value: string | null
}

export interface TableDataParams {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  /** Raw WHERE clause (advanced/power-user mode). Ignored when `filters` is non-empty. */
  filter?: string
  /** Structured, safely-parameterized column filters built from the UI filter builder. */
  filters?: FilterCondition[]
}

export interface RowIdentifier {
  [column: string]: unknown
}

export interface UpdateRowParams {
  connectionId: string
  schema: string
  table: string
  primaryKey: RowIdentifier
  changes: Record<string, unknown>
}

export interface InsertRowParams {
  connectionId: string
  schema: string
  table: string
  values: Record<string, unknown>
}

export interface DeleteRowParams {
  connectionId: string
  schema: string
  table: string
  primaryKey: RowIdentifier
}

export interface RunQueryParams {
  connectionId: string
  sql: string
}

export interface CreateTableColumn {
  name: string
  dataType: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string | null
}

export interface CreateTableParams {
  connectionId: string
  schema: string
  table: string
  columns: CreateTableColumn[]
}

export interface AlterColumnParams {
  connectionId: string
  schema: string
  table: string
  original: ColumnInfo
  updated: CreateTableColumn
}

export interface AddColumnParams {
  connectionId: string
  schema: string
  table: string
  column: CreateTableColumn
}

export interface DropColumnParams {
  connectionId: string
  schema: string
  table: string
  column: string
}

export interface DropTableParams {
  connectionId: string
  schema: string
  table: string
}

export interface AddIndexParams {
  connectionId: string
  schema: string
  table: string
  name: string
  columns: string[]
  unique: boolean
}

export interface DropIndexParams {
  connectionId: string
  schema: string
  table: string
  index: IndexInfo
}

export interface AddForeignKeyParams {
  connectionId: string
  schema: string
  table: string
  name: string
  column: string
  refTable: string
  refColumn: string
}

export interface DropForeignKeyParams {
  connectionId: string
  schema: string
  table: string
  name: string
}

export interface AlterIndexParams {
  connectionId: string
  schema: string
  table: string
  original: IndexInfo
  updated: { name: string; columns: string[]; unique: boolean }
}

export interface AlterForeignKeyParams {
  connectionId: string
  schema: string
  table: string
  original: ForeignKeyInfo
  updated: { name: string; column: string; refTable: string; refColumn: string }
}

export interface ExportParams {
  connectionId: string
  schema: string
  table: string
  format: 'csv' | 'json'
  filter?: string
}

export interface ImportCsvParams {
  connectionId: string
  schema: string
  table: string
  filePath: string
}

/** Exports an already-fetched row set (e.g. a query's results) without re-querying the DB. */
export interface ExportRowsParams {
  rows: Record<string, unknown>[]
  format: 'csv' | 'json'
  /** Used as the default file name in the save dialog, without extension. */
  suggestedName?: string
}

export interface QueryHistoryEntry {
  id: string
  connectionId: string
  sql: string
  /** ISO timestamp of when the query was run. */
  ranAt: string
  durationMs?: number
  rowCount?: number
  error?: string
}
