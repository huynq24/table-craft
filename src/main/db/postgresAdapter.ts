import { Pool } from 'pg'
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
  return '"' + name.replace(/"/g, '""') + '"'
}

export class PostgresAdapter implements DbAdapter {
  private pool: Pool | null = null

  defaultSchema(): string {
    return 'public'
  }

  quoteIdent(name: string): string {
    return q(name)
  }

  async connect(config: ConnectionConfig): Promise<void> {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || 'postgres',
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5
    })
    const client = await this.pool.connect()
    client.release()
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

  private get db(): Pool {
    if (!this.pool) throw new Error('Not connected')
    return this.pool
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const res = await this.db.query(
      `SELECT datname as name FROM pg_database WHERE datistemplate = false ORDER BY datname`
    )
    return res.rows.map((r) => ({ name: r.name as string }))
  }

  async listTables(schema: string): Promise<TableInfo[]> {
    const res = await this.db.query(
      `SELECT c.relname as name, c.relkind as kind,
              coalesce(s.n_live_tup, 0) as rowcount
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = $1 AND c.relkind IN ('r','v','m')
       ORDER BY c.relname`,
      [schema]
    )
    return res.rows.map((r) => ({
      name: r.name as string,
      schema,
      type: r.kind === 'r' ? 'table' : 'view',
      rowCountEstimate: Number(r.rowcount)
    }))
  }

  async getPrimaryKeyColumns(schema: string, table: string): Promise<string[]> {
    const res = await this.db.query(
      `SELECT a.attname as name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = ($1 || '.' || $2)::regclass AND i.indisprimary`,
      [schema, table]
    )
    return res.rows.map((r) => r.name as string)
  }

  async getTableStructure(schema: string, table: string): Promise<TableStructure> {
    const colRes = await this.db.query(
      `SELECT column_name as name, data_type as "dataType", is_nullable as nullable,
              column_default as "defaultValue", character_maximum_length as "maxLength"
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    )
    const pkCols = new Set(await this.getPrimaryKeyColumns(schema, table))
    const columns: ColumnInfo[] = colRes.rows.map((r) => ({
      name: r.name as string,
      dataType: r.dataType as string,
      nullable: r.nullable === 'YES',
      isPrimaryKey: pkCols.has(r.name as string),
      defaultValue: (r.defaultValue as string) ?? null,
      maxLength: (r.maxLength as number) ?? null
    }))

    const idxRes = await this.db.query(
      `SELECT i.relname as name, a.attname as col, ix.indisunique as unique, ix.indisprimary as primary
       FROM pg_class t
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_index ix ON ix.indrelid = t.oid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE n.nspname = $1 AND t.relname = $2
       ORDER BY i.relname`,
      [schema, table]
    )
    const idxMap = new Map<string, IndexInfo>()
    for (const r of idxRes.rows) {
      const name = r.name as string
      if (!idxMap.has(name)) {
        idxMap.set(name, { name, columns: [], unique: r.unique as boolean, primary: r.primary as boolean })
      }
      idxMap.get(name)!.columns.push(r.col as string)
    }

    const fkRes = await this.db.query(
      `SELECT
         con.conname as name,
         att2.attname as col,
         cl.relname as "refTable",
         att.attname as "refCol"
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.confrelid
       JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = ANY(con.confkey)
       JOIN pg_attribute att2 ON att2.attrelid = con.conrelid AND att2.attnum = ANY(con.conkey)
       JOIN pg_class tc ON tc.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = tc.relnamespace
       WHERE con.contype = 'f' AND n.nspname = $1 AND tc.relname = $2`,
      [schema, table]
    )
    const foreignKeys: ForeignKeyInfo[] = fkRes.rows.map((r) => ({
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
      const { clause, values: v } = buildWhereFromFilters(filters, q, (i) => `$${i}`, 1)
      if (clause) {
        sql += ` WHERE ${clause}`
        values.push(...v)
      }
    } else if (filter && filter.trim()) {
      sql += ` WHERE ${filter}`
    }
    if (orderBy) sql += ` ORDER BY ${q(orderBy)} ${orderDir === 'DESC' ? 'DESC' : 'ASC'}`
    sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    const res = await this.db.query(sql, values)
    return {
      columns: res.fields.map((f) => f.name),
      rows: res.rows,
      rowCount: res.rows.length,
      durationMs: performance.now() - start
    }
  }

  async updateRow(params: Omit<UpdateRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, primaryKey, changes } = params
    const setEntries = Object.entries(changes)
    const setParts = setEntries.map(([c], idx) => `${q(c)} = $${idx + 1}`)
    const setValues = setEntries.map(([, v]) => v)
    const { clause, values: pkValues } = buildWhereFromPrimaryKey(primaryKey, q, setEntries.length + 1)
    const sql = `UPDATE ${q(schema)}.${q(table)} SET ${setParts.join(', ')} WHERE ${clause}`
    await this.db.query(sql, [...setValues, ...pkValues])
  }

  async insertRow(params: Omit<InsertRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, values } = params
    const cols = Object.keys(values)
    const placeholders = cols.map((_, i) => `$${i + 1}`)
    const sql = `INSERT INTO ${q(schema)}.${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders.join(', ')})`
    await this.db.query(sql, Object.values(values))
  }

  async deleteRow(params: Omit<DeleteRowParams, 'connectionId'>): Promise<void> {
    const { schema, table, primaryKey } = params
    const { clause, values } = buildWhereFromPrimaryKey(primaryKey, q, 1)
    const sql = `DELETE FROM ${q(schema)}.${q(table)} WHERE ${clause}`
    await this.db.query(sql, values)
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const start = performance.now()
    try {
      const res = await this.db.query(sql)
      return {
        columns: res.fields ? res.fields.map((f) => f.name) : [],
        rows: res.rows,
        rowCount: res.rows.length,
        affectedRows: res.rowCount ?? undefined,
        durationMs: performance.now() - start
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
    const base = `ALTER TABLE ${q(schema)}.${q(table)}`
    if (updated.dataType !== original.dataType) {
      await this.db.query(`${base} ALTER COLUMN ${q(original.name)} TYPE ${updated.dataType} USING ${q(original.name)}::${updated.dataType}`)
    }
    if (updated.nullable !== original.nullable) {
      await this.db.query(`${base} ALTER COLUMN ${q(original.name)} ${updated.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`)
    }
    if (updated.defaultValue !== original.defaultValue) {
      if (updated.defaultValue === null || updated.defaultValue === '') {
        await this.db.query(`${base} ALTER COLUMN ${q(original.name)} DROP DEFAULT`)
      } else {
        await this.db.query(`${base} ALTER COLUMN ${q(original.name)} SET DEFAULT ${updated.defaultValue}`)
      }
    }
    if (updated.name !== original.name) {
      await this.db.query(`${base} RENAME COLUMN ${q(original.name)} TO ${q(updated.name)}`)
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
      `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${q(schema)}.${q(table)} (${cols})`
    )
  }

  async dropIndex(params: Omit<DropIndexParams, 'connectionId'>): Promise<void> {
    const { schema, table, index } = params
    if (index.primary) {
      await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP CONSTRAINT ${q(index.name)}`)
    } else {
      await this.db.query(`DROP INDEX ${q(schema)}.${q(index.name)}`)
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
    await this.db.query(`ALTER TABLE ${q(schema)}.${q(table)} DROP CONSTRAINT ${q(name)}`)
  }

  async alterForeignKey(params: Omit<AlterForeignKeyParams, 'connectionId'>): Promise<void> {
    const { schema, table, original, updated } = params
    await this.dropForeignKey({ schema, table, name: original.name })
    await this.addForeignKey({ schema, table, ...updated })
  }
}
