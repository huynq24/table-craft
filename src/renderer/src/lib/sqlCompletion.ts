import { keywordCompletionSource, schemaCompletionSource } from '@codemirror/lang-sql'
import type { SQLDialect } from '@codemirror/lang-sql'
import type { Completion, CompletionSource } from '@codemirror/autocomplete'
import type { TableStructure } from '@shared/types'

export interface TableRelation {
  /** The other table this one can be joined to. */
  table: string
  /** Ready-to-insert ON condition, e.g. "orders.user_id = users.id". */
  onSql: string
  /** Human-readable description shown in the completion detail column. */
  via: string
}

export type RelationMap = Record<string, TableRelation[]>

/**
 * Builds a bidirectional table-relationship map from each table's foreign keys, so that
 * `JOIN` completion can suggest not only the tables a FK points *to*, but also the tables
 * that point back *at* it (e.g. from `users`, suggest `orders` even though the FK column
 * lives on `orders`, not `users`).
 */
export function buildRelationMap(
  tableNames: string[],
  structures: (TableStructure | null)[]
): RelationMap {
  const map: RelationMap = {}
  const add = (table: string, rel: TableRelation): void => {
    const list = (map[table] ??= [])
    if (!list.some((r) => r.table === rel.table && r.onSql === rel.onSql)) list.push(rel)
  }
  tableNames.forEach((table, i) => {
    const structure = structures[i]
    if (!structure) return
    for (const fk of structure.foreignKeys) {
      if (!fk.refTable || fk.refTable === table) continue
      const onSql = `${table}.${fk.column} = ${fk.refTable}.${fk.refColumn}`
      add(table, { table: fk.refTable, onSql, via: `${table}.${fk.column} → ${fk.refTable}.${fk.refColumn}` })
      add(fk.refTable, { table, onSql, via: `${fk.refTable}.${fk.refColumn} ← ${table}.${fk.column}` })
    }
  })
  return map
}

/** Pulls table names already referenced via FROM/JOIN out of the query typed so far. */
function extractReferencedTables(sqlText: string): Set<string> {
  const found = new Set<string>()
  const re = /\b(?:FROM|JOIN)\s+[`"[]?([A-Za-z_][A-Za-z0-9_]*)[`"\]]?/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(sqlText))) {
    found.add(match[1])
  }
  return found
}

/**
 * A CodeMirror completion source that:
 *  - after `JOIN `, suggests tables related (via FK, in either direction) to whatever
 *    tables are already in the query, each pre-filled with a ready-made `ON` clause;
 *    other tables still show up below, just unprioritized.
 *  - everywhere else, falls back to the normal schema (table/column) + keyword completion,
 *    replicating what `sql()`'s built-in completion would otherwise provide.
 */
export function createJoinAwareSqlCompletion(
  dialect: SQLDialect,
  schema: Record<string, string[]>,
  defaultSchema: string,
  relationMap: RelationMap
): CompletionSource {
  const schemaSource = schemaCompletionSource({ dialect, schema, defaultSchema })
  const keywordSource = keywordCompletionSource(dialect, true)

  return (context) => {
    const word = context.matchBefore(/[`"[\]\w]*/)
    if (word) {
      const lookback = context.state.sliceDoc(Math.max(0, word.from - 30), word.from)
      if (/\bjoin\s+$/i.test(lookback)) {
        const referenced = extractReferencedTables(context.state.doc.toString())
        const seen = new Set<string>()
        const options: Completion[] = []

        referenced.forEach((t) => {
          ;(relationMap[t] ?? []).forEach((rel) => {
            if (referenced.has(rel.table) || seen.has(rel.table)) return
            seen.add(rel.table)
            options.push({
              label: rel.table,
              type: 'class',
              detail: `related · ${rel.via}`,
              boost: 10,
              apply: `${rel.table} ON ${rel.onSql}`
            })
          })
        })

        Object.keys(schema).forEach((t) => {
          if (seen.has(t) || referenced.has(t)) return
          options.push({ label: t, type: 'class' })
        })

        if (options.length > 0) {
          return { from: word.from, to: word.to, options, validFor: /^[`"[\]\w]*$/ }
        }
      }
    }
    return schemaSource(context) ?? keywordSource(context)
  }
}
