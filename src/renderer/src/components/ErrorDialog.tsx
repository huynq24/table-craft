interface Props {
  title?: string
  errors: string[]
  onClose: () => void
}

/** Modal listing every error from a batch operation (e.g. Save) — one line each, instead of
 * squeezing them into a single hard-to-read banner. */
export default function ErrorDialog({ title, errors, onClose }: Props): JSX.Element {
  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(errors.join('\n'))
    } catch {
      // clipboard access failing here isn't worth its own error dialog
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {title ?? 'Errors'} ({errors.length})
        </div>
        <div className="modal-body">
          <ul className="error-list">
            {errors.map((err, i) => (
              <li key={i} className="error-list-item">
                {err}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={copyAll}>
            Copy all
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
