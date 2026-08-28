import { create } from 'zustand'
import type { ConnectionGroup, ConnectionSummary, FilterCondition, RoutineType, TableInfo } from '@shared/types'

export type TabKind = 'table' | 'query' | 'trigger' | 'routine'

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
  /**
   * A filter to apply as soon as this tab's TableView mounts/updates — set by "jump to
   * referenced row" (clicking a foreign-key cell opens/focuses the target table's tab with
   * this filled in). TableView applies it once, then clears it via clearPendingFilter so
   * re-activating the tab later doesn't reapply a stale filter.
   */
  pendingFilter?: FilterCondition[]
  /** kind 'trigger' | 'routine' only — the trigger/routine's own name (distinct from `table`,
   *  which for a trigger tab instead holds the table it's attached to). */
  objectName?: string
  /** Only for kind 'routine' — which SHOW CREATE/DDL flavor to use. */
  routineType?: RoutineType
  /** True for a brand-new trigger/routine tab that hasn't been saved (created) yet. */
  isNew?: boolean
}

interface AppState {
  savedConnections: ConnectionSummary[]
  connectionGroups: ConnectionGroup[]
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
  setConnectionGroups: (list: ConnectionGroup[]) => void
  setConnected: (id: string, connected: boolean) => void
  setActiveConnection: (id: string | null) => void
  setTables: (connectionId: string, tables: TableInfo[]) => void
  openTab: (tab: Tab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  clearPendingFilter: (id: string) => void
  openConnectModal: (editing?: ConnectionSummary | null) => void
  closeConnectModal: () => void
  resizeSidebarBy: (deltaPx: number) => void
  resizeQueryEditorBy: (deltaPx: number) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  savedConnections: [],
  connectionGroups: [],
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
  setConnectionGroups: (list) => set({ connectionGroups: list }),

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
      const existing = s.tabs.find((t) => {
        if (t.connectionId !== tab.connectionId || t.kind !== tab.kind) return false
        if (tab.kind === 'query') return t.id === tab.id
        if (tab.kind === 'trigger' || tab.kind === 'routine') return t.objectName === tab.objectName
        return t.table === tab.table
      })
      if (existing && tab.kind !== 'query') {
        // Tab's already open (e.g. "jump to referenced row" landed on a table that's already
        // a tab) — just focus it, but still carry over a pendingFilter so the jump's intent
        // (show me that specific record) still takes effect.
        const tabs = tab.pendingFilter
          ? s.tabs.map((t) => (t.id === existing.id ? { ...t, pendingFilter: tab.pendingFilter } : t))
          : s.tabs
        return { tabs, activeTabId: existing.id }
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

  clearPendingFilter: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.pendingFilter ? { ...t, pendingFilter: undefined } : t))
    })),

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
