import logo from '../assets/logo.png'
import { IconDownload } from './icons'
import { DOWNLOAD_URL, REPO_URL, VERSION } from '../config'

export default function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-inner">
        <img src={logo} alt="TableCraft" className="hero-logo hero-float" width={72} height={72} />

        <p className="eyebrow hero-fade" style={{ animationDelay: '60ms' }}>
          Free &amp; open source · For Windows
        </p>

        <h1 className="hero-fade" style={{ animationDelay: '120ms' }}>
          Manage MySQL &amp; PostgreSQL
          <br />
          without touching a terminal
        </h1>

        <p className="hero-subtitle hero-fade" style={{ animationDelay: '200ms' }}>
          TableCraft is a TablePlus-style desktop client: connect to your databases, browse
          and edit data right in the grid, manage table structure, and run SQL queries with
          smart autocomplete — all in one fast, lightweight app.
        </p>

        <div className="hero-actions hero-fade" style={{ animationDelay: '280ms' }}>
          <a href={DOWNLOAD_URL} className="btn btn-primary">
            <IconDownload width={18} height={18} />
            Download for Windows
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost">
            View source
          </a>
        </div>
        <p className="hero-meta hero-fade" style={{ animationDelay: '340ms' }}>
          Version {VERSION} · Windows 10/11 (64-bit) · ~80&nbsp;MB · NSIS installer
        </p>

        <div className="badge-row hero-fade" style={{ animationDelay: '400ms' }} aria-label="Supported databases">
          <span className="badge">MySQL</span>
          <span className="badge">MariaDB</span>
          <span className="badge">PostgreSQL</span>
        </div>
      </div>
    </section>
  )
}
