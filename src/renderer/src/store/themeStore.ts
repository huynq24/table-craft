import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'tablecraft-theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (e.g. private mode) — fall back to default.
  }
  return 'dark'
}

function applyThemeToDocument(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

// Applied synchronously at module load (before the first React render) to avoid a
// flash of the wrong theme.
const initialTheme = readStoredTheme()
applyThemeToDocument(initialTheme)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyThemeToDocument(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore — theme just won't persist across restarts
    }
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
}))
