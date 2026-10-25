import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * Theme preference.
 *
 * Three modes are stored, but only two are ever rendered: `system` resolves to
 * light or dark from the OS setting and keeps following it, so a student who
 * leaves it on `system` gets dark mode when their machine switches at sunset
 * without touching the app.
 *
 * The resolved theme is written to `data-theme` on <html>, which is what
 * `tokens.css` keys its dark palette off. An inline script in `index.html`
 * applies the same attribute before first paint so there is no light flash on
 * reload; the constants below must stay in sync with it.
 */

export const THEME_STORAGE_KEY = 'sp-theme';
export const THEME_MODES = ['light', 'dark', 'system'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Browser chrome colour per resolved theme, matched to --c-bg. */
const META_THEME_COLOR = {
  light: '#f7f8fa',
  dark: '#0b0f17',
};

function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** Reads the stored mode, falling back to `system` for missing or junk values. */
export function readStoredMode() {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : 'system';
  } catch {
    // Private browsing can throw on localStorage access. A missing preference
    // must never stop the app from rendering.
    return 'system';
  }
}

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return prefersDark() ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_THEME_COLOR[theme]);
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readStoredMode);
  const [systemTheme, setSystemTheme] = useState(() =>
    prefersDark() ? 'dark' : 'light',
  );

  const theme = mode === 'system' ? systemTheme : mode;

  // Track the OS preference so `system` stays live rather than being read once
  // at mount.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Preference is session-only when storage is unavailable.
    }
  }, [mode]);

  // Keep duplicate tabs consistent.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== THEME_STORAGE_KEY) return;
      setMode(THEME_MODES.includes(event.newValue) ? event.newValue : 'system');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next) => {
    setMode(THEME_MODES.includes(next) ? next : 'system');
  }, []);

  /** Flips to the opposite of what is on screen, leaving `system` behind. */
  const toggleTheme = useCallback(() => {
    setMode((current) => {
      const showing = current === 'system' ? resolveTheme('system') : current;
      return showing === 'dark' ? 'light' : 'dark';
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      theme,
      isDark: theme === 'dark',
      systemTheme,
      setTheme,
      toggleTheme,
    }),
    [mode, theme, systemTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return context;
}

export default ThemeContext;
