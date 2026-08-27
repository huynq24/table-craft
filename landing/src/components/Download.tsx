import Reveal from './Reveal'
import { IconDownload, IconMonitor } from './icons'
import { DOWNLOAD_URL, RELEASES_URL, VERSION } from '../config'

const STEPS = [
  'Download the installer below (.exe)',
  'Run it — the NSIS installer lets you pick the install folder',
  'Launch TableCraft and add your first connection',
]

export default function Download() {
  return (
    <section id="download" className="download">
      <div className="container">
        <Reveal>
          <div className="download-card">
            <div className="download-icon-wrap">
              <span className="ping-ring" aria-hidden="true" />
              <span className="ping-ring" style={{ animationDelay: '1.2s' }} aria-hidden="true" />
              <div className="download-icon">
                <IconMonitor width={26} height={26} />
              </div>
            </div>
            <h2>Download TableCraft for Windows</h2>
            <p className="download-version">
              Version {VERSION} · Windows 10/11 (64-bit) · ~80&nbsp;MB
            </p>

            <a href={DOWNLOAD_URL} className="btn btn-primary btn-large">
              <IconDownload width={19} height={19} />
              Download for free
            </a>
            <p className="download-trust">No account, no telemetry — just download and connect.</p>
            <p className="download-alt">
              or see all releases on{' '}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                GitHub Releases
              </a>
            </p>

            <ol className="download-steps">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>

            <p className="download-note">
              Known limitations in v{VERSION}: editing or deleting a row requires a primary key,
              the SQL editor runs one statement at a time, and SQLite/SQL Server support is on
              the roadmap.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
