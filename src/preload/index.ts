import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddColumnParams,
  AlterColumnParams,
  ConnectionConfig,
  CreateTableParams,
  DeleteRowParams,
  DropColumnParams,
  DropTableParams,
  ExportParams,
  ExportRowsParams,
  ImportCsvParams,
  InsertRowParams,
  TableDataParams,
  UpdateRowParams
} from '@shared/types'

const api = {
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    save: (config: ConnectionConfig) => ipcRenderer.invoke('connections:save', config),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    getWithPassword: (id: string) => ipcRenderer.invoke('connections:getWithPassword', id)
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

    exportTable: (params: ExportParams) => ipcRenderer.invoke('db:exportTable', params),
    exportRows: (params: ExportRowsParams) => ipcRenderer.invoke('db:exportRows', params),
    pickImportFile: () => ipcRenderer.invoke('db:pickImportFile'),
    importCsv: (params: ImportCsvParams) => ipcRenderer.invoke('db:importCsv', params)
  },
  history: {
    list: (connectionId?: string) => ipcRenderer.invoke('history:list', connectionId),
    remove: (id: string) => ipcRenderer.invoke('history:remove', id),
    clear: (connectionId?: string) => ipcRenderer.invoke('history:clear', connectionId)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
