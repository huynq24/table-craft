import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { COMMON_TYPES } from '../lib/sqlTypes'

interface Props {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  placeholder?: string
}

interface Pos {
  top: number
  left: number
  width: number
}

/**
 * A free-text SQL data-type input with a click-to-open list of common types (INT, VARCHAR(255),
 * …). Deliberately not a native `<input list>` + `<datalist>` combo: Electron/Chromium's datalist
 * popup doesn't reliably open on click in this app's window, so this rolls a small dropdown by
 * hand. The list itself is portaled to `document.body` and positioned with `position: fixed` from
 * the input's live bounding rect — this input always sits inside a table cell with `overflow:
 * hidden` (for text-ellipsis), which would otherwise clip an absolutely-positioned dropdown down
 * to nothing before it's ever visible. Still a plain text input underneath — typing a custom type
 * (e.g. "int(11)") works as before.
 */
export default function TypeInput({ value, onChange, autoFocus, placeholder }: Props): JSX.Element {
  const [pos, setPos] = useState<Pos | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const open = pos !== null

  function openDropdown(): void {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width })
  }

  useEffect(() => {
    if (!open) return
    function close(): void {
      setPos(null)
    }
    function closeIfOutside(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', closeIfOutside)
    // The portal's position is a one-shot snapshot of the input's rect — any scroll (the
    // enclosing table, the modal body) or resize would leave it floating over the wrong spot,
    // so just close it rather than track along.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', closeIfOutside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Filters the list as you type; falls back to the full list if nothing matches, so typing
  // a not-yet-listed custom type (e.g. "int(11)") doesn't just leave the dropdown empty.
  const filtered = COMMON_TYPES.filter((t) => t.toLowerCase().includes(value.trim().toLowerCase()))
  const options = value.trim() === '' || filtered.length === 0 ? COMMON_TYPES : filtered

  function selectValue(v: string): void {
    onChange(v)
    setPos(null)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          openDropdown()
          e.target.select()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPos(null)
        }}
        style={{
          width: '100%',
          background: 'var(--bg-0)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '3px 22px 3px 3px'
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        title="Show common types"
        // preventDefault keeps focus on the text input — otherwise the button stealing focus
        // fires the input's onBlur before the click handler below ever runs.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setPos(null) : openDropdown())}
        className="type-combobox-toggle"
      >
        <ChevronDown size={13} />
      </button>
      {pos &&
        createPortal(
          <div
            className="type-combobox-list"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map((t) => (
              <div
                key={t}
                className="type-combobox-item"
                // onMouseDown (not onClick) + preventDefault so this fires before the input's
                // blur closes the list out from under the click.
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectValue(t)
                }}
              >
                {t}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
