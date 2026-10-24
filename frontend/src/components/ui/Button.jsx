import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import Spinner from './Spinner';
import './Button.css';

/**
 * variant: primary | secondary | ghost | danger | subtle
 * size: sm | md
 * While `loading` the label stays in place (keeping the button width stable)
 * and the spinner replaces the leading icon.
 */
const Button = forwardRef(function Button(
  {
    children,
    variant = 'secondary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    className = '',
    to,
    href,
    ...rest
  },
  ref,
) {
  const classes = [
    'sp-btn',
    `sp-btn--${variant}`,
    `sp-btn--${size}`,
    fullWidth ? 'sp-btn--full' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {loading ? (
        <Spinner size={size === 'sm' ? 13 : 15} />
      ) : iconLeft ? (
        <Icon name={iconLeft} size={size === 'sm' ? 15 : 17} />
      ) : null}
      {children ? <span className="sp-btn__label">{children}</span> : null}
      {!loading && iconRight ? (
        <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />
      ) : null}
    </>
  );

  if (to && !disabled && !loading) {
    return (
      <Link ref={ref} to={to} className={classes} {...rest}>
        {inner}
      </Link>
    );
  }

  if (href && !disabled && !loading) {
    return (
      <a ref={ref} href={href} className={classes} {...rest}>
        {inner}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {inner}
    </button>
  );
});

export default Button;
