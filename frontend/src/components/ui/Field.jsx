import { useId } from 'react';
import './Field.css';

/**
 * Label + hint + error wrapper shared by every form control.
 * Children receive the generated ids so `aria-describedby` / `aria-invalid`
 * always point at the right nodes.
 */
export default function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  id: providedId,
  className = '',
  children,
  labelAction,
}) {
  const generated = useId();
  const id = providedId || htmlFor || `f-${generated}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`sp-field ${error ? 'is-invalid' : ''} ${className}`.trim()}>
      {label ? (
        <div className="sp-field__labelrow">
          <label className="sp-field__label" htmlFor={id}>
            {label}
            {required ? (
              <span className="sp-field__required" aria-hidden="true">
                {' '}
                *
              </span>
            ) : null}
          </label>
          {labelAction ? <div className="sp-field__labelaction">{labelAction}</div> : null}
        </div>
      ) : null}

      {typeof children === 'function'
        ? children({ id, describedBy, invalid: Boolean(error) })
        : children}

      {hint && !error ? (
        <p className="sp-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="sp-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
