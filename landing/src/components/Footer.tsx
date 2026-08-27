import { REPO_URL } from '../config'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>&copy; 2026 huynq24 · TableCraft — built with Electron, React &amp; TypeScript.</p>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
    </footer>
  )
}
