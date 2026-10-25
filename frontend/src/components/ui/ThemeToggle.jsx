import Icon from './Icon';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

const MODE_OPTIONS = [
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
  { value: 'system', icon: 'monitor', label: 'System' },
];

/**
 * Appearance control, in two shapes:
 *
 * - `switch` (default) — a single icon button for the top bar. One click flips
 *   between light and dark. Compact, and the common case.
 * - `segmented` — a three-way light / dark / system group for the settings
 *   page, where `system` needs to be reachable.
 *
 * `variant="inverse"` matches the dark admin sidebar.
 */
export default function ThemeToggle({
  shape = 'switch',
  variant = 'default',
  className = '',
}) {
  const { mode, theme, isDark, setTheme, toggleTheme } = useTheme();

  if (shape === 'segmented') {
    return (
      <div
        className={`sp-themeseg ${className}`.trim()}
        role="radiogroup"
        aria-label="Appearance"
      >
        {MODE_OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`sp-themeseg__btn ${active ? 'is-active' : ''}`.trim()}
              onClick={() => setTheme(option.value)}
            >
              <Icon name={option.icon} size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const next = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={`sp-themetoggle sp-themetoggle--${variant} ${className}`.trim()}
      onClick={toggleTheme}
      // The icon alone carries the meaning, so the control needs its own name.
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span className="sp-themetoggle__track" aria-hidden="true">
        <span className="sp-themetoggle__thumb">
          <Icon name={isDark ? 'moon' : 'sun'} size={13} />
        </span>
      </span>
      {/* Announce the result of the click, not just the control's new name. */}
      <span className="sp-visually-hidden" aria-live="polite">
        {`${theme === 'dark' ? 'Dark' : 'Light'} theme active`}
      </span>
    </button>
  );
}
