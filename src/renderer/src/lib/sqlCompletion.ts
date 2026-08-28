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
 * A CodeMirror completion source that, after `JOIN `, suggests tables related (via FK, in
 * either direction) to whatever tables are already in the query, each pre-filled with a
 * ready-made `ON` clause; other tables still show up below, just unprioritized. Returns
 * `null` everywhere else so it can be combined with other sources (schema, keywords) via
 * `autocompletion`'s `override` array — CodeMirror merges results from all active sources
 * into a single dropdown, so this doesn't need to replicate them itself.
 */
function createJoinAwareCompletion(schema: Record<string, string[]>, relationMap: RelationMap): CompletionSource {
  return (context) => {
    const word = context.matchBefore(/[`"[\]\w]*/)
    if (!word) return null
    const lookback = context.state.sliceDoc(Math.max(0, word.from - 30), word.from)
    if (!/\bjoin\s+$/i.test(lookback)) return null

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

    return options.length > 0 ? { from: word.from, to: word.to, options, validFor: /^[`"[\]\w]*$/ } : null
  }
}

/**
 * Builds the full set of completion sources for the query editor: JOIN-aware table
 * suggestions, schema (table/column) completion, and SQL keyword completion. Pass the
 * whole array to `autocompletion({ override })` — CodeMirror runs every source and merges
 * their results, so table/column names and database keywords (SELECT, WHERE, JOIN, …) show
 * up together instead of one silently shadowing the other.
 */
export function buildSqlCompletionSources(
  dialect: SQLDialect,
  schema: Record<string, string[]>,
  defaultSchema: string,
  relationMap: RelationMap
): CompletionSource[] {
  return [
    createJoinAwareCompletion(schema, relationMap),
    schemaCompletionSource({ dialect, schema, defaultSchema }),
    keywordCompletionSource(dialect, true)
  ]
}
