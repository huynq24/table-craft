import Reveal from './Reveal'

const TABLES = ['users', 'orders', 'products', 'invoices', 'payments']

const ROWS = [
  { id: 1, name: 'Alice Johnson', email: 'alice@mail.com', status: 'active' },
  { id: 2, name: 'Ben Carter', email: 'ben@mail.com', status: 'active' },
  { id: 3, name: 'Chloe Diaz', email: 'chloe@mail.com', status: 'pending' },
  { id: 4, name: 'David Kim', email: 'david@mail.com', status: 'active' },
]

export default function Preview() {
  return (
    <section id="preview" className="preview">
      <div className="container">
        <Reveal>
          <h2 className="section-title">A familiar UI, nothing to relearn</h2>
          <p className="section-subtitle">
            Illustration of the app layout — connection sidebar, table/query tabs, and an editable data grid.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="mock-window">
            <div className="mock-titlebar">
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-dot" />
              <span className="mock-titlebar-label">TableCraft — production-db</span>
            </div>

            <div className="mock-body">
              <aside className="mock-sidebar">
                <div className="mock-sidebar-header">production-db</div>
                <div className="mock-search">Search tables…</div>
                <ul className="mock-table-list">
                  {TABLES.map((t, i) => (
                    <li key={t} className={i === 0 ? 'active' : ''}>
                      {t}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="mock-main">
                <div className="mock-tabs">
                  <span className="mock-tab active">users · Data</span>
                  <span className="mock-tab">users · Structure</span>
                  <span className="mock-tab">Query 1</span>
                </div>

                <div className="mock-grid">
                  <div className="mock-grid-row mock-grid-head">
                    <span>id</span>
                    <span>name</span>
                    <span>email</span>
                    <span>status</span>
                  </div>
                  {ROWS.map((r, i) => (
                    <div className="mock-grid-row mock-grid-row-anim" style={{ animationDelay: `${300 + i * 90}ms` }} key={r.id}>
                      <span>{r.id}</span>
                      <span>{r.name}</span>
                      <span>{r.email}</span>
                      <span className={`mock-pill ${r.status}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
