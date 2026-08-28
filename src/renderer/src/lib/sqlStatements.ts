/**
 * Splits a SQL script into individual statements on top-level `;` boundaries, so the query
 * editor can run "the statement under the cursor" or "every statement in the selection"
 * instead of always sending the whole buffer as one opaque string.
 *
 * Semicolons inside string/identifier literals ('...', "...", `...`) or comments (-- ... and
 * /* ... *\/) don't count as separators. This is a lightweight scanner, not a real SQL parser —
 * good enough to avoid splitting mid-string, not a guarantee for every dialect edge case.
 */

export interface SqlStatement {
  /** Statement text, trimmed of surrounding whitespace. */
  text: string
  /** Offset of `text` (post-trim) in the original source. */
  start: number
  /** End offset (exclusive) of `text` in the original source. */
  end: number
}

export function splitStatements(source: string): SqlStatement[] {
  const statements: SqlStatement[] = []
  let stmtStart = 0
  let i = 0
  const n = source.length

  const pushStatement = (rawEnd: number): void => {
    const raw = source.slice(stmtStart, rawEnd)
    const leading = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (trimmed.length > 0) {
      const start = stmtStart + leading
      statements.push({ text: trimmed, start, end: start + trimmed.length })
    }
  }

  while (i < n) {
    const ch = source[i]

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < n) {
        if (source[i] === '\\' && quote !== '`') {
          i += 2
          continue
        }
        if (source[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }

    if (ch === '-' && source[i + 1] === '-') {
      i += 2
      while (i < n && source[i] !== '\n') i++
      continue
    }

    if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (ch === ';') {
      pushStatement(i)
      stmtStart = i + 1
      i++
      continue
    }

    i++
  }

  pushStatement(n)
  return statements
}

/** Finds the statement whose range contains `offset`, falling back to the nearest preceding one
 *  (so a cursor sitting right after a trailing `;` or in trailing whitespace still resolves). */
export function statementAtOffset(statements: SqlStatement[], offset: number): SqlStatement | null {
  if (statements.length === 0) return null
  for (const stmt of statements) {
    if (offset >= stmt.start && offset <= stmt.end) return stmt
  }
  let nearest = statements[0]
  for (const stmt of statements) {
    if (stmt.start <= offset) nearest = stmt
    else break
  }
  return nearest
}
