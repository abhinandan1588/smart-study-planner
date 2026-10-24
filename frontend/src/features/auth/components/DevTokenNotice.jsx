import Button from '../../../components/ui/Button';

/**
 * No SMTP provider is configured, so the backend returns the verification /
 * reset token in the response while EXPOSE_DEV_TOKENS is on. Showing it here
 * is what makes the verify and reset flows testable from the UI.
 */
export default function DevTokenNotice({ token, label, actionLabel, onUse }) {
  if (!token) return null;
  return (
    <div className="sp-auth__devtoken">
      <span>
        <strong>Development mode:</strong> email delivery is not configured, so the{' '}
        {label} is returned by the API.
      </span>
      <code>{token}</code>
      {onUse ? (
        <Button size="sm" variant="secondary" onClick={() => onUse(token)}>
          {actionLabel || 'Use this token'}
        </Button>
      ) : null}
    </div>
  );
}
