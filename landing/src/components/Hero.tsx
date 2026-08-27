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
          100% Free &amp; Open Source · For Windows
        </p>

        <h1 className="hero-fade" style={{ animationDelay: '120ms' }}>
          A fast desktop client for
          <br />
          <span className="hero-gradient-text">MySQL &amp; PostgreSQL</span>
        </h1>

        <p className="hero-subtitle hero-fade" style={{ animationDelay: '200ms' }}>
          Browse and edit data straight in the grid, manage table structure visually, and
          write SQL with autocomplete that actually knows your schema. TableCraft is a
          TablePlus-style database client built to be fast, lightweight, and free — no
          terminal required.
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
          Version {VERSION} · Windows 10/11 (64-bit) · ~80&nbsp;MB installer · No sign-up required
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
