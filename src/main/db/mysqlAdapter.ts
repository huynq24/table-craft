import mysql from 'mysql2/promise'
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
  DeleteRowParams,
  DropColumnParams,
  DropForeignKeyParams,
  DropIndexParams,
  DropTableParams,
  ForeignKeyInfo,
  IndexInfo,
  InsertRowParams,
  QueryResult,
  TableDataParams,
  TableInfo,
  TableStructure,
  UpdateRowParams
} from '@shared/types'
import type { DbAdapter } from './adapter'
import { buildWhereFromFilters, buildWhereFromPrimaryKey } from './adapter'

function q(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

// Values that started life as a JS Date — via clipboard copy/paste (JSON.stringify
// serializes Date to ISO 8601) or an Export CSV -> Import CSV round trip (papaparse
// does the same) — come back as an ISO string like "2023-01-07T02:03:01.000Z". MySQL's
// DATETIME/TIMESTAMP columns reject the 'T'/'Z' ISO format outright (ER_TRUNCATED_WRONG_VALUE),
// so normalize it to the 'YYYY-MM-DD HH:MM:SS' form MySQL expects before it ever reaches SQL.
const ISO_DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/

function normalizeDateTimeValue(v: unknown): unknown {
  if (typeof v !== 'string') return v
  const m = v.match(ISO_DATETIME)
  return m ? `${m[1]} ${m[2]}` : v
}

function normalizeRow<T extends Record<string, unknown>>(values: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) out[k] = normalizeDateTimeValue(v)
  return out as T
}

export class MysqlAdapter implements DbAdapter {
  private pool: mysql.Pool | null = null

  defaultSchema(config: ConnectionConfig): string {
    return config.database
  }

  quoteIdent(name: string): string {
    return q(name)
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      ssl: config.ssl ? {} : undefined,
      connectionLimit: 5,
      dateStrings: false
    })
    // verify credentials actually work
    const conn = await this.pool.getConnection()
    conn.release()
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }

  isConnected(): boolean {
    return this.pool !== null
  }

  private get db(): mysql.Pool {
    if (!this.pool) throw new Error('Not connected')
    return this.pool
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const [rows] = await this.db.query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows
      .map((r) => r.Database as string)
      .filter((n) => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(n))
      .map((name) => ({ name }))
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const [rows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME as name, TABLE_TYPE as type, TABLE_ROWS as rowCount
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
      [schema]
    )
    return rows.map((r) => ({
      name: r.name as string,
      schema,
      type: r.type === 'VIEW' ? 'view' : 'table',
      rowCountEstimate: r.rowCount as number
    }))
  }

  async getPrimaryKeyColumns(schema: string, table: string): Promise<string[]> {
    const [rows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME as name FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY ORDINAL_POSITION`,
      [schema, table]
    )
    return rows.map((r) => r.name as string)
  }

  async getTableStructure(schema: string, table: string): Promise<TableStructure> {
    const [colRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME as name, COLUMN_TYPE as dataType, IS_NULLABLE as nullable,
              COLUMN_KEY as colKey, COLUMN_DEFAULT as defaultValue, CHARACTER_MAXIMUM_LENGTH as maxLength,
              EXTRA as extra
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [schema, table]
    )
    const columns: ColumnInfo[] = colRows.map((r) => ({
      name: r.name as string,
      dataType: r.dataType as string,
      nullable: r.nullable === 'YES',
      isPrimaryKey: r.colKey === 'PRI',
      defaultValue: (r.defaultValue as string) ?? null,
      maxLength: (r.maxLength as number) ?? null,
      extra: (r.extra as string) || undefined
    }))

    const [idxRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME as name, COLUMN_NAME as col, NON_UNIQUE as nonUnique
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [schema, table]
    )
    const idxMap = new Map<string, IndexInfo>()
    for (const r of idxRows) {
      const name = r.name as string
      if (!idxMap.has(name)) {
        idxMap.set(name, { name, columns: [], unique: r.nonUnique === 0, primary: name === 'PRIMARY' })
      }
      idxMap.get(name)!.columns.push(r.col as string)
    }

    const [fkRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME as name, COLUMN_NAME as col, REFERENCED_TABLE_NAME as refTable,
              REFERENCED_COLUMN_NAME as refCol
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [schema, table]
    )
    const foreignKeys: ForeignKeyInfo[] = fkRows.map((r) => ({
      name: r.name as string,
      column: r.col as string,
      refTable: r.refTable as string,
      refColumn: r.refCol as string
    }))

    return { columns, indexes: [...idxMap.values()], foreignKeys }
  }

  async getTableData(params: Omit<TableDataParams, 'connectionId'>): Promise<QueryResult> {
    const start = performance.now()
    const { schema, table, limit, offset, orderBy, orderDir, filter, filters } = params
    let sql = `SELECT * FROM ${q(schema)}.${q(table)}`
    const values: unknown[] = []
    if (filters && filters.length) {
      const { clause, values: v } = buildWhereFromFilters(filters, q, () => '?')
      if (clause) {
        sql += ` WHERE ${clause}`
        values.push(...v)
      }
    } else if (filter && filter.trim()) {
      sql += ` WHERE ${filter}`
    }
    if (orderBy) sql += ` ORDER BY ${q(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
    sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    const [rows, fields] = await this.db.query<mysql.RowDataPacket[]>(sql, values)
    return {
      columns: fields.map((f) => f.name),
      rows: rows as Record<string, unknown>[],
      rowCount: rows.length,
      durationMs: performance.now() - start
    }
  }

  async updateRow(params: Omit<UpdateRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, primaryKey, changes } = params
    const normalized = normalizeRow(changes)
    const setParts = Object.keys(normalized).map((c) => `${q(c)} = ?`)
    const setValues = Object.values(normalized)
    const { clause, values: pkValues } = buildWhereFromPrimaryKey(primaryKey, q, 0, () => '?')
    const sql = `UPDATE ${q(schema)}.${q(table)} SET ${setParts.join(', ')} WHERE ${clause}`
    await this.db.query(sql, [...setValues, ...pkValues])
  }

  async insertRow(params: Omit<InsertRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, values } = params
    const normalized = normalizeRow(values)
    const cols = Object.keys(normalized)
    const placeholders = cols.map(() => '?')
    const sql = `INSERT INTO ${q(schema)}.${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders.join(', ')})`
    await this.db.query(sql, Object.values(normalized))
  }

  async deleteRow(params: Omit<DeleteRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, primaryKey } = params
    const { clause, values } = buildWhereFromPrimaryKey(primaryKey, q, 0, () => '?')
    const sql = `DELETE FROM ${q(schema)}.${q(table)} WHERE ${clause}`
    await this.db.query(sql, values)
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const start = performance.now()
    try {
      const [result, fields] = await this.db.query(sql)
      const durationMs = performance.now() - start
      if (Array.isArray(result)) {
        return {
          columns: fields ? (fields as mysql.FieldPacket[]).map((f) => f.name) : [],
          rows: result as Record<string, unknown>[],
          rowCount: (result as unknown[]).length,
          durationMs
        }
      }
      const info = result as mysql.ResultSetHeader
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: info.affectedRows,
        durationMs
      }
    } catch (err) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: performance.now() - start,
        error: (err as Error).message
      }
    }
  }

  async createTable(params: Omit<CreateTableParams, 'connectionId'>): Promise<void> {
    const { schema, table, columns } = params
    const defs = columns.map((c) => {
      let def = `${q(c.name)} ${c.dataType}`
      if (!c.nullable) def += ' NOT NULL'
      if (c.defaultValue !== null && c.defaultValue !== '') def += ` DEFAULT ${c.defaultValue}`
      return def
    })
    const pkCols = columns.filter((c) => c.primaryKey).map((c) => q(c.name))
    if (pkCols.length) defs.push(`PRIMARY KEY (${pkCols.join(', ')})`)
    const sql = `CREATE TABLE ${q(schema)}.${q(table)} (${defs.join(', ')})`
    await this.db.query(sql)
  }

  async addColumn(params: Omit<AddColumnParams, 'connectionId'>): Promise<void> {
    const { schema, table, column } = params
    let def = `${q(column.name)} ${column.dataType}`
    if (!column.nullable) def += ' NOT NULL'
    if (column.defaultValue !== null && column.defaultValue !== '') def += ` DEFAULT ${column.defaultValue}`
    await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} ADD COLUMN ${def}`)
  }

  async alterColumn(params: Omit<AlterColumnParams, 'connectionId'>): Promise<void> {
    const { schema, table, original, updated } = params
    let def = `${q(original.name)} ${updated.dataType}`
    if (!updated.nullable) def += ' NOT NULL'
    if (updated.defaultValue !== null && updated.defaultValue !== '') def += ` DEFAULT ${updated.defaultValue}`
    let sql = `ALTER TABLE ${q(schema)}.${q(table)} MODIFY COLUMN ${def}`
    await this.db.query(sql)
    if (updated.name !== original.name) {
      await this.db.query(
        `ALTER TABLE ${q(schema)}.${q(table)} RENAME COLUMN ${q(original.name)} TO ${q(updated.name)}`
      )
    }
  }

  async dropColumn(params: Omit<DropColumnParams, 'connectionId'>): Promise<void> {
    const { schema, table, column } = params
    await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP COLUMN ${q(column)}`)
  }

  async dropTable(params: Omit<DropTableParams, 'connectionId'>): Promise<void> {
    const { schema, table } = params
    await this.db.query(`DROP TABLE ${q(schema)}.${q(table)}`)
  }

  async addIndex(params: Omit<AddIndexParams, 'connectionId'>): Promise<void> {
    const { schema, table, name, columns, unique } = params
    const cols = columns.map(q).join(', ')
    await this.db.query(
      `ALTER TABLE ${q(schema)}.${q(table)} ADD ${unique ? 'UNIQUE ' : ''}INDEX ${q(name)} (${cols})`
    )
  }

  async dropIndex(params: Omit<DropIndexParams, 'connectionId'>): Promise<void> {
    const { schema, table, index } = params
    if (index.primary) {
      await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP PRIMARY KEY`)
    } else {
      await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP INDEX ${q(index.name)}`)
    }
  }

  async alterIndex(params: Omit<AlterIndexParams, 'connectionId'>): Promise<void> {
    const { schema, table, original, updated } = params
    await this.dropIndex({ schema, table, index: original })
    await this.addIndex({ schema, table, name: updated.name, columns: updated.columns, unique: updated.unique })
  }

  async addForeignKey(params: Omit<AddForeignKeyParams, 'connectionId'>): Promise<void> {
    const { schema, table, name, column, refTable, refColumn } = params
    await this.db.query(
      `ALTER TABLE ${q(schema)}.${q(table)} ADD CONSTRAINT ${q(name)} FOREIGN KEY (${q(column)}) REFERENCES ${q(schema)}.${q(refTable)} (${q(refColumn)})`
    )
  }

  async dropForeignKey(params: Omit<DropForeignKeyParams, 'connectionId'>): Promise<void> {
    const { schema, table, name } = params
    await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP FOREIGN KEY ${q(name)}`)
  }

  async alterForeignKey(params: Omit<AlterForeignKeyParams, 'connectionId'>): Promise<void> {
    const { schema, table, original, updated } = params
    await this.dropForeignKey({ schema, table, name: original.name })
    await this.addForeignKey({ schema, table, ...updated })
  }
}
