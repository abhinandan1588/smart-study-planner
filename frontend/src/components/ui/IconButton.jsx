import { forwardRef } from 'react';
import Icon from './Icon';
import Spinner from './Spinner';
import './IconButton.css';

/**
 * Square icon-only control. `label` is mandatory for screen readers and is
 * also used as the native tooltip.
 */
const IconButton = forwardRef(function IconButton(
  {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled = false,
    badge,
    className = '',
    type = 'button',
    ...rest
  },
  ref,
) {
  const classes = [
    'sp-iconbtn',
    `sp-iconbtn--${variant}`,
    `sp-iconbtn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 13 : 15} />
      ) : (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      )}
      {badge ? <span className="sp-iconbtn__badge">{badge}</span> : null}
    </button>
  );
});

export default IconButton;
