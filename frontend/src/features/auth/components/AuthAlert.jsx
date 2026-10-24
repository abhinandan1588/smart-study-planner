import Icon from '../../../components/ui/Icon';

/** tone: error | success | info */
export default function AuthAlert({ tone = 'error', children }) {
  if (!children) return null;
  const icon = tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'warning';
  return (
    <div
      className={`sp-auth__alert sp-auth__alert--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="sp-auth__alert-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>{children}</div>
    </div>
  );
}
