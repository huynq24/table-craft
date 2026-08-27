import type { ComponentType, SVGProps } from 'react'
import Reveal from './Reveal'
import { IconLink, IconEdit, IconGrid, IconCode, IconTransfer, IconLayout } from './icons'

type Feature = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: IconLink,
    title: 'Secure connection management',
    description:
      'Save unlimited MySQL, MariaDB, and PostgreSQL connections. Every password is encrypted at rest with Electron’s safeStorage, and you can test a connection before it ever gets saved.',
  },
  {
    icon: IconEdit,
    title: 'Inline data editing',
    description:
      'Double-click any cell to edit it, add or delete rows in place. Build filters visually — pick a column, an operator, a value — or drop into Advanced SQL for a raw WHERE clause.',
  },
  {
    icon: IconGrid,
    title: 'Visual schema management',
    description:
      'Add, edit, and drop columns without writing DDL by hand. Inspect indexes and foreign keys at a glance, and search across columns instantly from the Structure tab.',
  },
  {
    icon: IconCode,
    title: 'SQL editor that knows your schema',
    description:
      'A CodeMirror-powered editor with full syntax highlighting. Autocomplete suggests real table and column names, and typing JOIN pre-fills the ON clause from your actual foreign keys.',
  },
  {
    icon: IconTransfer,
    title: 'Effortless import & export',
    description:
      'Export table data or query results to CSV or JSON — filters included. Import a CSV straight into any table in a couple of clicks.',
  },
  {
    icon: IconLayout,
    title: 'Built for daily use',
    description:
      'Light and dark themes that remember your choice. Work across multiple tables, queries, and connections in tabs, with Ctrl+S to save and Ctrl+R to reload.',
  },
]

export default function Features() {
  return (
    <section id="features" className="features">
      <div className="container">
        <Reveal>
          <h2 className="section-title">Everything you need, nothing you don’t</h2>
          <p className="section-subtitle">
            You won’t need to memorize SQL for everyday tasks — but a full SQL editor is always
            one tab away.
          </p>
        </Reveal>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="feature-card">
                <div className="feature-icon">
                  <f.icon />
                </div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
