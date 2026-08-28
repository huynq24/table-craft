import { useEffect } from 'react'
import { Database } from 'lucide-react'
import { useAppStore } from './store/appStore'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TableView from './components/TableView'
import QueryEditor from './components/QueryEditor'
import ConnectionModal from './components/ConnectionModal'
import ErrorBoundary from './components/ErrorBoundary'
import ResizeHandle from './components/ResizeHandle'

export default function App(): JSX.Element {
  const { setSavedConnections, tabs, activeTabId, connectModalOpen, resizeSidebarBy } = useAppStore()

  useEffect(() => {
    window.api.connections.list().then(setSavedConnections)
  }, [setSavedConnections])

  // Ctrl/Cmd+F focuses the search box for whichever panel the mouse is currently
  // hovering over (sidebar table search, structure column search, query history
  // search, data-tab WHERE filter), rather than a single global search box. Panels
  // mark their search input's container with `data-search-container` and the input
  // itself with `data-search-input`; hidden/unmounted panels never match since
  // `:hover` only reflects elements actually under the pointer.
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent): void {
      const ctrlOrCmd = e.ctrlKey || e.metaKey
      if (!ctrlOrCmd || e.key.toLowerCase() !== 'f') return
      const hovered = document.querySelectorAll(':hover')
      const deepest = hovered[hovered.length - 1] as HTMLElement | undefined
      const container = deepest?.closest<HTMLElement>('[data-search-container]')
      const input = container?.querySelector<HTMLInputElement>('[data-search-input]')
      if (!input) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="app">
      <Sidebar />
      <ResizeHandle direction="horizontal" onResize={resizeSidebarBy} />
      <div className="main">
        <TabBar />
        <div className="tab-content">
          {!activeTab && (
            <div className="empty-state">
              <Database size={40} strokeWidth={1.5} />
              <div>Select a connection and a table to get started</div>
            </div>
          )}
          {tabs.map((tab) => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
              <ErrorBoundary label={tab.title}>
                {tab.kind === 'table' ? (
                  <TableView tab={tab} />
                ) : (
                  <QueryEditor tab={tab} />
                )}
              </ErrorBoundary>
            </div>
          ))}
        </div>
      </div>
      {connectModalOpen && <ConnectionModal />}
    </div>
  )
}
