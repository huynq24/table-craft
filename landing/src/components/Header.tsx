import logo from '../assets/logo.png'
import { REPO_URL, DOWNLOAD_URL } from '../config'

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="#top" className="brand">
          <img src={logo} alt="" className="brand-logo" width={28} height={28} />
          <span>TableCraft</span>
        </a>

        <nav className="nav-links">
          <a href="#features">Features</a>
          <a href="#preview">Preview</a>
          <a href="#download">Download</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="nav-github">
            <svg viewBox="0 0 19 19" width={18} height={18} aria-hidden="true">
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
                clipRule="evenodd"
              />
            </svg>
            GitHub
          </a>
        </nav>

        <a href={DOWNLOAD_URL} className="btn btn-primary btn-small">
          Download
        </a>
      </div>
    </header>
  )
}
