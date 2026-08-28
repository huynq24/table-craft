import { create } from 'zustand'
import type { ConnectionSummary, TableInfo } from '@shared/types'

export type TabKind = 'table' | 'query'

// Resizable layout bounds. Sizes persist across restarts via localStorage since the
// store itself has no persistence middleware wired up.
const SIDEBAR_WIDTH_KEY = 'tablecraft:sidebarWidth'
const SIDEBAR_MIN_WIDTH = 180
const SIDEBAR_MAX_WIDTH = 480
const SIDEBAR_DEFAULT_WIDTH = 260

const QUERY_EDITOR_HEIGHT_KEY = 'tablecraft:queryEditorHeight'
const QUERY_EDITOR_MIN_HEIGHT = 120
const QUERY_EDITOR_MAX_HEIGHT = 640
const QUERY_EDITOR_DEFAULT_HEIGHT = 200

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function writeStoredWidth(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // localStorage unavailable (e.g. private mode) — resize still works, just won't persist.
  }
}

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
  sidebarWidth: number
  queryEditorHeight: number

  setSavedConnections: (list: ConnectionSummary[]) => void
  setConnected: (id: string, connected: boolean) => void
  setActiveConnection: (id: string | null) => void
  setTables: (connectionId: string, tables: TableInfo[]) => void
  openTab: (tab: Tab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  openConnectModal: (editing?: ConnectionSummary | null) => void
  closeConnectModal: () => void
  resizeSidebarBy: (deltaPx: number) => void
  resizeQueryEditorBy: (deltaPx: number) => void
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
  sidebarWidth: readStoredWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH),
  queryEditorHeight: readStoredWidth(QUERY_EDITOR_HEIGHT_KEY, QUERY_EDITOR_DEFAULT_HEIGHT),

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
  closeConnectModal: () => set({ connectModalOpen: false, editingConnection: null }),

  resizeSidebarBy: (deltaPx) =>
    set((s) => {
      const sidebarWidth = clamp(s.sidebarWidth + deltaPx, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      writeStoredWidth(SIDEBAR_WIDTH_KEY, sidebarWidth)
      return { sidebarWidth }
    }),

  resizeQueryEditorBy: (deltaPx) =>
    set((s) => {
      const queryEditorHeight = clamp(s.queryEditorHeight + deltaPx, QUERY_EDITOR_MIN_HEIGHT, QUERY_EDITOR_MAX_HEIGHT)
      writeStoredWidth(QUERY_EDITOR_HEIGHT_KEY, queryEditorHeight)
      return { queryEditorHeight }
    })
}))
