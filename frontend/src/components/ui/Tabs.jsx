import { useRef } from 'react';
import './Tabs.css';

/**
 * Roving-tabindex tablist: only the active tab is focusable, arrow keys move
 * between tabs, Home/End jump to the ends.
 *
 * items: [{ key, label, count, disabled }]
 */
export default function Tabs({
  items = [],
  active,
  onChange,
  variant = 'line',
  ariaLabel = 'Sections',
  className = '',
}) {
  const refs = useRef({});

  const enabled = items.filter((item) => !item.disabled);

  function move(offset) {
    const index = enabled.findIndex((item) => item.key === active);
    if (index === -1 || enabled.length === 0) return;
    const next = enabled[(index + offset + enabled.length) % enabled.length];
    onChange?.(next.key);
    refs.current[next.key]?.focus();
  }

  function onKeyDown(event) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        if (enabled[0]) {
          onChange?.(enabled[0].key);
          refs.current[enabled[0].key]?.focus();
        }
        break;
      case 'End': {
        event.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last) {
          onChange?.(last.key);
          refs.current[last.key]?.focus();
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <div
      className={`sp-tabs sp-tabs--${variant} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            ref={(node) => {
              refs.current[item.key] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${item.key}`}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            className={`sp-tabs__tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span className="sp-tabs__count">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ tabKey, active, children, className = '' }) {
  if (tabKey !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
      tabIndex={0}
      className={`sp-tabs__panel ${className}`.trim()}
    >
      {children}
    </div>
  );
}
