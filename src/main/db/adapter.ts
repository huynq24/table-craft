import type {
  AddColumnParams,
  AddForeignKeyParams,
  AddIndexParams,
  AlterColumnParams,
  AlterForeignKeyParams,
  AlterIndexParams,
  ColumnInfo,
  ConnectionConfig,
  CreateTableParams,
  DatabaseInfo,
  DdlOperation,
  DeleteRowParams,
  DropColumnParams,
  DropForeignKeyParams,
  DropIndexParams,
  DropTableParams,
  FilterCondition,
  InsertRowParams,
  QueryResult,
  RoutineInfo,
  RoutineType,
  TableDataParams,
  TableInfo,
  TableStructure,
  TriggerInfo,
  UpdateRowParams
} from '@shared/types'

/**
 * Common interface every database driver adapter must implement.
 * Keeps the rest of the app (IPC layer, renderer) database-agnostic.
 */
export interface DbAdapter {
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  /** The "default" schema/database to browse when a connection opens. */
  defaultSchema(config: ConnectionConfig): string

  listDatabases(): Promise<DatabaseInfo[]>
  listTables(schema: string): Promise<TableInfo[]>
  getTableStructure(schema: string, table: string): Promise<TableStructure>
  getPrimaryKeyColumns(schema: string, table: string): Promise<string[]>

  getTableData(params: Omit<TableDataParams, 'connectionId'>): Promise<QueryResult>
  updateRow(params: Omit<UpdateRowParams, 'connectionId'>): Promise<void>
  insertRow(params: Omit<InsertRowParams, 'connectionId'>): Promise<void>
  deleteRow(params: Omit<DeleteRowParams, 'connectionId'>): Promise<void>

  runQuery(sql: string): Promise<QueryResult>

  createTable(params: Omit<CreateTableParams, 'connectionId'>): Promise<void>
  addColumn(params: Omit<AddColumnParams, 'connectionId'>): Promise<void>
  alterColumn(params: Omit<AlterColumnParams, 'connectionId'>): Promise<void>
  dropColumn(params: Omit<DropColumnParams, 'connectionId'>): Promise<void>
  dropTable(params: Omit<DropTableParams, 'connectionId'>): Promise<void>

  addIndex(params: Omit<AddIndexParams, 'connectionId'>): Promise<void>
  dropIndex(params: Omit<DropIndexParams, 'connectionId'>): Promise<void>
  alterIndex(params: Omit<AlterIndexParams, 'connectionId'>): Promise<void>
  addForeignKey(params: Omit<AddForeignKeyParams, 'connectionId'>): Promise<void>
  dropForeignKey(params: Omit<DropForeignKeyParams, 'connectionId'>): Promise<void>
  alterForeignKey(params: Omit<AlterForeignKeyParams, 'connectionId'>): Promise<void>

  /** Returns the SQL statement(s) a `DdlOperation` would run, without executing them. */
  buildDdlSql(op: DdlOperation): string[]

  /** Quote an identifier (table/column name) safely for this driver. */
  quoteIdent(name: string): string

  listTriggers(schema: string): Promise<TriggerInfo[]>
  getTriggerDefinition(schema: string, name: string): Promise<string>
  /** Executes the caller's raw CREATE TRIGGER SQL as-is. */
  saveTrigger(schema: string, sql: string): Promise<void>
  dropTrigger(schema: string, name: string, table: string): Promise<void>

  listRoutines(schema: string): Promise<RoutineInfo[]>
  getRoutineDefinition(schema: string, name: string, type: RoutineType): Promise<string>
  /** Executes the caller's raw CREATE PROCEDURE/FUNCTION SQL as-is. */
  saveRoutine(schema: string, sql: string): Promise<void>
  dropRoutine(schema: string, name: string, type: RoutineType): Promise<void>
}

export function buildWhereFromPrimaryKey(
  pk: Record<string, unknown>,
  quoteIdent: (n: string) => string,
  startIndex = 1,
  placeholder: (i: number) => string = (i) => `$${i}`
): { clause: string; values: unknown[] } {
  const entries = Object.entries(pk)
  const parts: string[] = []
  const values: unknown[] = []
  entries.forEach(([col, val], idx) => {
    if (val === null) {
      parts.push(`${quoteIdent(col)} IS NULL`)
    } else {
      parts.push(`${quoteIdent(col)} = ${placeholder(startIndex + idx)}`)
      values.push(val)
    }
  })
  return { clause: parts.join(' AND '), values }
}

/**
 * Builds a safely-parameterized `WHERE` clause from structured filter conditions
 * (the column-based filter builder in the UI), instead of concatenating raw SQL.
 */
export function buildWhereFromFilters(
  filters: FilterCondition[],
  quoteIdent: (n: string) => string,
  placeholder: (i: number) => string,
  startIndex = 1
): { clause: string; values: unknown[] } {
  const parts: string[] = []
  const values: unknown[] = []
  let idx = startIndex
  for (const f of filters) {
    if (!f.column) continue
    const col = quoteIdent(f.column)
    if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
      parts.push(`${col} ${f.operator}`)
      continue
    }
    let val = f.value ?? ''
    if (f.operator === 'LIKE' && !val.includes('%')) val = `%${val}%`
    parts.push(`${col} ${f.operator} ${placeholder(idx)}`)
    values.push(val)
    idx++
  }
  return { clause: parts.join(' AND '), values }
}
