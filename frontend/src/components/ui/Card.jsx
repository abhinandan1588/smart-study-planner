import './Card.css';

/** Flat surface: 1px border + the small shadow. No gradients. */
export default function Card({
  title,
  subtitle,
  actions,
  footer,
  padded = true,
  as: Tag = 'section',
  className = '',
  bodyClassName = '',
  children,
  ...rest
}) {
  const hasHeader = Boolean(title || subtitle || actions);
  return (
    <Tag className={`sp-card ${className}`.trim()} {...rest}>
      {hasHeader ? (
        <header className="sp-card__head">
          <div className="sp-card__heading">
            {title ? <h3 className="sp-card__title">{title}</h3> : null}
            {subtitle ? <p className="sp-card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="sp-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div
        className={[
          'sp-card__body',
          padded ? '' : 'sp-card__body--flush',
          bodyClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
      {footer ? <footer className="sp-card__foot">{footer}</footer> : null}
    </Tag>
  );
}
