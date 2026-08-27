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
    title: 'Connection management',
    description:
      'Save multiple MySQL/MariaDB and PostgreSQL connections at once. Passwords are encrypted at rest via Electron’s safeStorage. Test a connection before saving it.',
  },
  {
    icon: IconEdit,
    title: 'Browse & edit data',
    description:
      'Double-click a cell to edit it inline, add or delete rows. Column-based filter builder (pick a column, operator, value) or Advanced SQL mode for a raw WHERE clause.',
  },
  {
    icon: IconGrid,
    title: 'Table structure',
    description:
      'View, add, edit, and drop columns. Inspect indexes and foreign keys. Search columns by name, drop a table when you need to — all from the Structure tab.',
  },
  {
    icon: IconCode,
    title: 'Smart SQL editor',
    description:
      'CodeMirror-based editor with syntax highlighting. Autocomplete suggests real table/column names from the database, and typing JOIN prioritizes related tables and pre-fills ON.',
  },
  {
    icon: IconTransfer,
    title: 'Import / Export',
    description:
      'Export table data or query results to CSV/JSON (respects the active filter). Import data from a CSV file into a table.',
  },
  {
    icon: IconLayout,
    title: 'UI & productivity',
    description:
      'Light and dark theme, remembered across restarts. Multiple tabs for tables/queries, multiple connections open at once. Ctrl+S saves, Ctrl+R reloads.',
  },
]

export default function Features() {
  return (
    <section id="features" className="features">
      <div className="container">
        <Reveal>
          <h2 className="section-title">Everything you need for day-to-day database work</h2>
          <p className="section-subtitle">
            No need to memorize SQL for every action — but a full SQL editor is right there when you need it.
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
