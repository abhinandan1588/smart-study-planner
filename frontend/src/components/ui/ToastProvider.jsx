import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import IconButton from './IconButton';
import './Toast.css';

const ToastContext = createContext(null);

const ICONS = {
  success: 'check',
  error: 'warning',
  warning: 'warning',
  info: 'info',
};

let counter = 0;

/**
 * Toast host. `useToast().show({ tone, title, message })`, auto-dismissed
 * after 4s. Errors use role="alert", everything else role="status".
 */
export function ToastProvider({ children, duration = 4000 }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const show = useCallback(
    ({ tone = 'info', title, message, duration: itemDuration } = {}) => {
      counter += 1;
      const id = `toast-${counter}`;
      setToasts((current) => [...current, { id, tone, title, message }]);
      const ttl = itemDuration ?? duration;
      if (ttl > 0) {
        timersRef.current[id] = setTimeout(() => dismiss(id), ttl);
      }
      return id;
    },
    [dismiss, duration],
  );

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (title, message) => show({ tone: 'success', title, message }),
      error: (title, message) => show({ tone: 'error', title, message }),
      warning: (title, message) => show({ tone: 'warning', title, message }),
      info: (title, message) => show({ tone: 'info', title, message }),
      /** Surface a normalised ApiError with the backend's own message. */
      apiError: (error, title = 'Something went wrong') =>
        show({ tone: 'error', title, message: error?.message }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sp-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`sp-toast sp-toast--${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="sp-toast__icon">
              <Icon name={ICONS[toast.tone] || 'info'} size={18} />
            </span>
            <div className="sp-toast__body">
              {toast.title ? <p className="sp-toast__title">{toast.title}</p> : null}
              {toast.message ? (
                <p className="sp-toast__message">{toast.message}</p>
              ) : null}
            </div>
            <IconButton
              icon="close"
              label="Dismiss notification"
              size="sm"
              onClick={() => dismiss(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}

export default ToastProvider;
