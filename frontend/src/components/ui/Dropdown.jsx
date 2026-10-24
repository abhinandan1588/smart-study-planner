import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import './Dropdown.css';

/**
 * Keyboard-accessible menu.
 *
 * `trigger` is a render function receiving `{ ref, props }` so any control can
 * open the menu. Items: `[{ key, label, icon, to, onClick, tone, divider }]`.
 * Arrow keys move between items, Escape closes and returns focus to the
 * trigger, a click outside closes.
 */
export default function Dropdown({
  trigger,
  items = [],
  align = 'end',
  label = 'Menu',
  width,
  header,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = `menu-${useId()}`;

  const actionable = items.filter((item) => !item.divider);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  function close(restoreFocus = true) {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    }
  }

  function onMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % actionable.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + actionable.length) % actionable.length);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(actionable.length - 1);
    }
  }

  const triggerProps = {
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close(false) : setOpen(true)),
    onKeyDown: onTriggerKeyDown,
  };

  let actionableIndex = -1;

  return (
    <div className={`sp-dropdown ${className}`.trim()} ref={rootRef}>
      {trigger({ ref: triggerRef, props: triggerProps, open })}

      {open ? (
        <div
          className={`sp-dropdown__menu sp-dropdown__menu--${align}`}
          style={width ? { width } : undefined}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {header ? <div className="sp-dropdown__header">{header}</div> : null}
          {items.map((item, index) => {
            if (item.divider) {
              return (
                <div
                  key={item.key || `divider-${index}`}
                  className="sp-dropdown__divider"
                  role="separator"
                />
              );
            }
            actionableIndex += 1;
            const refIndex = actionableIndex;
            const classes = [
              'sp-dropdown__item',
              item.tone === 'danger' ? 'sp-dropdown__item--danger' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const content = (
              <>
                {item.icon ? <Icon name={item.icon} size={16} /> : null}
                <span>{item.label}</span>
              </>
            );

            if (item.to) {
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  role="menuitem"
                  className={classes}
                  tabIndex={-1}
                  ref={(node) => {
                    itemRefs.current[refIndex] = node;
                  }}
                  onClick={() => close(false)}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={classes}
                tabIndex={-1}
                disabled={item.disabled}
                ref={(node) => {
                  itemRefs.current[refIndex] = node;
                }}
                onClick={() => {
                  close(false);
                  item.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
