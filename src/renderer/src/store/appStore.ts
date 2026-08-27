import { create } from 'zustand'
import type { ConnectionSummary, TableInfo } from '@shared/types'

export type TabKind = 'table' | 'query'

export interface Tab {
  id: string
  connectionId: string
  kind: TabKind
  title: string
  schema?: string
  table?: string
}

interface AppState {
  savedConnections: ConnectionSummary[]
  connectedIds: Set<string>
  activeConnectionId: string | null
  tablesByConnection: Record<string, TableInfo[]>
  tabs: Tab[]
  activeTabId: string | null
  connectModalOpen: boolean
  editingConnection: ConnectionSummary | null

  setSavedConnections: (list: ConnectionSummary[]) => void
  setConnected: (id: string, connected: boolean) => void
  setActiveConnection: (id: string | null) => void
  setTables: (connectionId: string, tables: TableInfo[]) => void
  openTab: (tab: Tab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  openConnectModal: (editing?: ConnectionSummary | null) => void
  closeConnectModal: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  savedConnections: [],
  connectedIds: new Set(),
  activeConnectionId: null,
  tablesByConnection: {},
  tabs: [],
  activeTabId: null,
  connectModalOpen: false,
  editingConnection: null,

  setSavedConnections: (list) => set({ savedConnections: list }),

  setConnected: (id, connected) =>
    set((s) => {
      const next = new Set(s.connectedIds)
      if (connected) next.add(id)
      else next.delete(id)
      return { connectedIds: next }
    }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  setTables: (connectionId, tables) =>
    set((s) => ({ tablesByConnection: { ...s.tablesByConnection, [connectionId]: tables } })),

  openTab: (tab) =>
    set((s) => {
      const existing = s.tabs.find(
        (t) => t.connectionId === tab.connectionId && t.kind === tab.kind && t.table === tab.table && (tab.kind !== 'query' || t.id === tab.id)
      )
      if (existing && tab.kind !== 'query') {
        return { activeTabId: existing.id }
      }
      return { tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        const fallback = tabs[idx] ?? tabs[idx - 1] ?? tabs[0]
        activeTabId = fallback ? fallback.id : null
      }
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  openConnectModal: (editing = null) => set({ connectModalOpen: true, editingConnection: editing }),
  closeConnectModal: () => set({ connectModalOpen: false, editingConnection: null })
}))
