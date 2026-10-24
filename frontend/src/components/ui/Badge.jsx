import './Badge.css';

/** tone: neutral | primary | success | warning | danger | info */
export default function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  ...rest
}) {
  return (
    <span
      className={`sp-badge sp-badge--${tone} sp-badge--${size} ${className}`.trim()}
      {...rest}
    >
      {dot ? <span className="sp-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
