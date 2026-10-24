import './Spinner.css';

export default function Spinner({ size = 16, label, tone = 'current' }) {
  return (
    <span
      className={`sp-spinner sp-spinner--${tone}`}
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {label ? <span className="sp-visually-hidden">{label}</span> : null}
    </span>
  );
}
