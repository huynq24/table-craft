import type { TableStructure } from '@shared/types'

/**
 * Recognizes "SELECT ... FROM <one table> [WHERE ...] [ORDER BY ...] [LIMIT ...]" — the only
 * shape simple enough that every result row unambiguously corresponds to exactly one physical
 * row in exactly one table. Anything that could blur that (JOIN, UNION, GROUP BY, DISTINCT) is
 * rejected: building an UPDATE off an ambiguous result risks writing to the wrong row, or a row
 * that doesn't really exist as such. This is a lightweight scanner, not a real SQL parser — a
 * false negative (declining to allow editing) is always safe; a false positive is not, so
 * anything even slightly ambiguous should fall through to `null`.
 */
export function detectSingleTableSource(sql: string): string | null {
  const s = sql.trim()
  if (!/^select\b/i.test(s)) return null
  if (/\b(join|union|group\s+by|distinct)\b/i.test(s)) return null

  const fromMatch = s.match(/\bfrom\s+((?:[`"[]?[A-Za-z_]\w*[`"\]]?\.)?[`"[]?[A-Za-z_]\w*[`"\]]?)/i)
  if (!fromMatch) return null

  // Reject a comma-joined FROM clause (implicit cross join) — scan just the FROM clause,
  // not the whole statement, so a comma in e.g. a WHERE ... IN (a, b) doesn't false-trigger.
  const clauseMatch = s.match(/\bfrom\b([\s\S]*?)(?:\bwhere\b|\bgroup\b|\border\b|\blimit\b|;|$)/i)
  if (clauseMatch?.[1].includes(',')) return null

  const qualified = fromMatch[1]
  const parts = qualified.split('.')
  const rawTable = parts[parts.length - 1]
  return rawTable.replace(/^[`"[]|[`"\]]$/g, '')
}

export interface EditTarget {
  table: string
  pkColumns: string[]
}

export interface EditabilityResult {
  target: EditTarget | null
  /** Human-readable reason editing is unavailable — null only when `target` is set. */
  reason: string | null
}

/**
 * Decides whether the result of running `sql` can be edited in place (see detectSingleTableSource
 * for what's allowed). Also requires the table's primary key to be known and present among the
 * selected columns — otherwise there's no reliable WHERE clause to target the right row.
 */
export function resolveEditability(
  sql: string,
  resultColumns: string[],
  tableStructures: Record<string, TableStructure | null>
): EditabilityResult {
  const table = detectSingleTableSource(sql)
  if (!table) {
    return { target: null, reason: 'Editing needs a plain single-table SELECT (no JOIN, UNION, GROUP BY, or DISTINCT).' }
  }
  if (!(table in tableStructures)) {
    return { target: null, reason: `Unknown table "${table}".` }
  }
  const structure = tableStructures[table]
  if (!structure) {
    return { target: null, reason: 'Loading table structure…' }
  }
  const pkColumns = structure.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
  if (pkColumns.length === 0) {
    return { target: null, reason: `"${table}" has no primary key, so rows can't be safely updated.` }
  }
  const missing = pkColumns.filter((pk) => !resultColumns.includes(pk))
  if (missing.length > 0) {
    return { target: null, reason: `Select ${missing.join(', ')} to enable editing (needed to identify each row).` }
  }
  return { target: { table, pkColumns }, reason: null }
}
