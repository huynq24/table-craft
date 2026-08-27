import { Play, Table2, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export default function TabBar(): JSX.Element {
  const { tabs, activeTabId, setActiveTab, closeTab } = useAppStore()

  if (tabs.length === 0) {
    return <div className="tabbar" style={{ minHeight: 37 }} />
  }

  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab${tab.id === activeTabId ? ' active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onMouseDown={(e) => {
            // Middle click closes the tab (browser-style). preventDefault here too, or
            // Chromium shows its middle-click-drag-to-scroll cursor before auxclick fires.
            if (e.button === 1) e.preventDefault()
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              closeTab(tab.id)
            }
          }}
          title={tab.title}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tab.kind === 'query' ? <Play size={11} style={{ flexShrink: 0 }} /> : <Table2 size={11} style={{ flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.title}</span>
          </span>
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          >
            <X size={12} />
          </span>
        </div>
      ))}
    </div>
  )
}
