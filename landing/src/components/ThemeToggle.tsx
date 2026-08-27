import { useEffect, useState } from 'react'
import { IconMoon, IconSun } from './icons'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'tablecraft-landing-theme'

function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (e.g. private mode) — fall through to system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Sun/moon button that toggles an explicit light/dark theme, overriding the OS preference. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore — theme just won't persist across visits.
    }
  }, [theme])

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <IconSun width={17} height={17} /> : <IconMoon width={17} height={17} />}
    </button>
  )
}
