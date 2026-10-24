import Button from './Button';
import Icon from './Icon';
import './State.css';

/**
 * Actionable error state. `error` is the normalised ApiError from
 * services/api.js, so the backend's own message is what the user reads.
 */
export default function ErrorState({
  error,
  title,
  onRetry,
  retryLabel = 'Try again',
  action,
  compact = false,
  boxed = false,
  className = '',
}) {
  const message =
    error?.message || 'The request failed. Check your connection and try again.';
  const heading =
    title ||
    (error?.isNetworkError
      ? 'Cannot reach the server'
      : error?.status === 403
        ? 'You do not have access'
        : error?.status === 404
          ? 'Not found'
          : 'Something went wrong');

  return (
    <div
      className={[
        'sp-state',
        'sp-state--error',
        compact ? 'sp-state--compact' : '',
        boxed ? 'sp-state--boxed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="alert"
    >
      <span className="sp-state__icon">
        <Icon name="warning" size={20} />
      </span>
      <h3 className="sp-state__title">{heading}</h3>
      <p className="sp-state__description">{message}</p>
      {error?.code && error.code !== 'UNKNOWN_ERROR' ? (
        <p className="sp-state__code">{error.code}</p>
      ) : null}
      {onRetry || action ? (
        <div className="sp-state__actions">
          {onRetry ? (
            <Button variant="secondary" iconLeft="refresh" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
