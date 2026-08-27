import { useEffect } from 'react'
import { Database } from 'lucide-react'
import { useAppStore } from './store/appStore'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import TableView from './components/TableView'
import QueryEditor from './components/QueryEditor'
import ConnectionModal from './components/ConnectionModal'
import ErrorBoundary from './components/ErrorBoundary'

export default function App(): JSX.Element {
  const { setSavedConnections, tabs, activeTabId, connectModalOpen } = useAppStore()

  useEffect(() => {
    window.api.connections.list().then(setSavedConnections)
  }, [setSavedConnections])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="app">
      <Sidebar />
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
