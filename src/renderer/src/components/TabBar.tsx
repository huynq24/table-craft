import { Play, Table2, X, Zap, Sigma } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { TabKind } from '../store/appStore'

function TabIcon({ kind }: { kind: TabKind }): JSX.Element {
  const style = { flexShrink: 0 }
  if (kind === 'query') return <Play size={11} style={style} />
  if (kind === 'trigger') return <Zap size={11} style={style} />
  if (kind === 'routine') return <Sigma size={11} style={style} />
  return <Table2 size={11} style={style} />
}

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
            <TabIcon kind={tab.kind} />
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
