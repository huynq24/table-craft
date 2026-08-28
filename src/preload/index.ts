import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddColumnParams,
  AddForeignKeyParams,
  AddIndexParams,
  AlterColumnParams,
  AlterForeignKeyParams,
  AlterIndexParams,
  ConnectionConfig,
  ConnectionGroup,
  CreateTableParams,
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
  QuerySnippet,
  RoutineType,
  TableDataParams,
  UpdateRowParams
} from '@shared/types'

const api = {
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (config: ConnectionConfig) => ipcRenderer.invoke('connections:save', config),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    getWithPassword: (id: string) => ipcRenderer.invoke('connections:getWithPassword', id),
    listGroups: () => ipcRenderer.invoke('connections:listGroups'),
    saveGroup: (group: ConnectionGroup) => ipcRenderer.invoke('connections:saveGroup', group),
    deleteGroup: (id: string) => ipcRenderer.invoke('connections:deleteGroup', id)
  },
  db: {
    connect: (config: ConnectionConfig) => ipcRenderer.invoke('db:connect', config),
    connectSaved: (id: string) => ipcRenderer.invoke('db:connectSaved', id),
    disconnect: (id: string) => ipcRenderer.invoke('db:disconnect', id),
    defaultSchema: (id: string) => ipcRenderer.invoke('db:defaultSchema', id),

    listDatabases: (id: string) => ipcRenderer.invoke('db:listDatabases', id),
    listTables: (id: string, schema: string) => ipcRenderer.invoke('db:listTables', id, schema),
    getTableStructure: (id: string, schema: string, table: string) =>
      ipcRenderer.invoke('db:getTableStructure', id, schema, table),
    getPrimaryKeyColumns: (id: string, schema: string, table: string) =>
      ipcRenderer.invoke('db:getPrimaryKeyColumns', id, schema, table),

    getTableData: (params: TableDataParams) => ipcRenderer.invoke('db:getTableData', params),
    updateRow: (params: UpdateRowParams) => ipcRenderer.invoke('db:updateRow', params),
    insertRow: (params: InsertRowParams) => ipcRenderer.invoke('db:insertRow', params),
    deleteRow: (params: DeleteRowParams) => ipcRenderer.invoke('db:deleteRow', params),

    runQuery: (connectionId: string, sql: string) => ipcRenderer.invoke('db:runQuery', connectionId, sql),

    createTable: (params: CreateTableParams) => ipcRenderer.invoke('db:createTable', params),
    addColumn: (params: AddColumnParams) => ipcRenderer.invoke('db:addColumn', params),
    alterColumn: (params: AlterColumnParams) => ipcRenderer.invoke('db:alterColumn', params),
    dropColumn: (params: DropColumnParams) => ipcRenderer.invoke('db:dropColumn', params),
    dropTable: (params: DropTableParams) => ipcRenderer.invoke('db:dropTable', params),

    addIndex: (params: AddIndexParams) => ipcRenderer.invoke('db:addIndex', params),
    dropIndex: (params: DropIndexParams) => ipcRenderer.invoke('db:dropIndex', params),
    alterIndex: (params: AlterIndexParams) => ipcRenderer.invoke('db:alterIndex', params),
    addForeignKey: (params: AddForeignKeyParams) => ipcRenderer.invoke('db:addForeignKey', params),
    dropForeignKey: (params: DropForeignKeyParams) => ipcRenderer.invoke('db:dropForeignKey', params),
    alterForeignKey: (params: AlterForeignKeyParams) => ipcRenderer.invoke('db:alterForeignKey', params),

    previewDdl: (params: PreviewDdlParams) => ipcRenderer.invoke('db:previewDdl', params),

    listTriggers: (id: string, schema: string) => ipcRenderer.invoke('db:listTriggers', id, schema),
    getTriggerDefinition: (id: string, schema: string, name: string) =>
      ipcRenderer.invoke('db:getTriggerDefinition', id, schema, name),
    saveTrigger: (id: string, schema: string, sql: string) => ipcRenderer.invoke('db:saveTrigger', id, schema, sql),
    dropTrigger: (id: string, schema: string, name: string, table: string) =>
      ipcRenderer.invoke('db:dropTrigger', id, schema, name, table),

    listRoutines: (id: string, schema: string) => ipcRenderer.invoke('db:listRoutines', id, schema),
    getRoutineDefinition: (id: string, schema: string, name: string, type: RoutineType) =>
      ipcRenderer.invoke('db:getRoutineDefinition', id, schema, name, type),
    saveRoutine: (id: string, schema: string, sql: string) => ipcRenderer.invoke('db:saveRoutine', id, schema, sql),
    dropRoutine: (id: string, schema: string, name: string, type: RoutineType) =>
      ipcRenderer.invoke('db:dropRoutine', id, schema, name, type),

    exportTable: (params: ExportParams) => ipcRenderer.invoke('db:exportTable', params),
    exportRows: (params: ExportRowsParams) => ipcRenderer.invoke('db:exportRows', params),
    pickImportFile: () => ipcRenderer.invoke('db:pickImportFile'),
    importCsv: (params: ImportCsvParams) => ipcRenderer.invoke('db:importCsv', params)
  },
  history: {
    list: (connectionId?: string) => ipcRenderer.invoke('history:list', connectionId),
    remove: (id: string) => ipcRenderer.invoke('history:remove', id),
    clear: (connectionId?: string) => ipcRenderer.invoke('history:clear', connectionId)
  },
  snippets: {
    list: (connectionId?: string) => ipcRenderer.invoke('snippets:list', connectionId),
    save: (snippet: Omit<QuerySnippet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
      ipcRenderer.invoke('snippets:save', snippet),
    remove: (id: string) => ipcRenderer.invoke('snippets:remove', id)
  },
  system: {
    pickTextFile: () => ipcRenderer.invoke('system:pickTextFile')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
