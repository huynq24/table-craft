import type { CreateTableColumn } from '@shared/types'

/** Shared between StructureView (add/edit column) and CreateTableModal (new table). */
export const COMMON_TYPES = [
  'INT',
  'BIGINT',
  'VARCHAR(255)',
  'TEXT',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'DECIMAL(10,2)',
  'FLOAT',
  'JSON'
]

export function emptyColumnDraft(): CreateTableColumn {
  return { name: '', dataType: 'VARCHAR(255)', nullable: true, primaryKey: false, defaultValue: null }
}
