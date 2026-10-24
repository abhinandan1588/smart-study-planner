import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import IconButton from './IconButton';
import './Dialog.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog rendered in a portal.
 * Escape and backdrop click close it, focus is trapped inside while open and
 * restored to the previously focused element on close.
 *
 * size: sm | md | lg
 * placement: center | right (the Drawer uses `right`)
 */
export default function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  size = 'md',
  placement = 'center',
  closeOnBackdrop = true,
  showClose = true,
  children,
  className = '',
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const reactId = useId();
  const titleId = `dlg-${reactId}-title`;
  const descId = `dlg-${reactId}-desc`;

  const close = useCallback(() => onClose?.(), [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    restoreRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === 'function') restore.focus();
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div
      className={`sp-dialog sp-dialog--${placement}`}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={`sp-dialog__panel sp-dialog__panel--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {title || showClose ? (
          <header className="sp-dialog__head">
            <div>
              {title ? (
                <h2 className="sp-dialog__title" id={titleId}>
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="sp-dialog__desc" id={descId}>
                  {description}
                </p>
              ) : null}
            </div>
            {showClose ? (
              <IconButton icon="close" label="Close dialog" onClick={close} />
            ) : null}
          </header>
        ) : null}

        <div className="sp-dialog__body">{children}</div>

        {footer ? <footer className="sp-dialog__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
