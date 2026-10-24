import Icon from './Icon';
import './State.css';

/** Useful empty state: says what is missing and what to do next. */
export default function EmptyState({
  icon = 'inbox',
  title = 'Nothing here yet',
  description,
  action,
  secondaryAction,
  compact = false,
  boxed = false,
  className = '',
}) {
  return (
    <div
      className={[
        'sp-state',
        compact ? 'sp-state--compact' : '',
        boxed ? 'sp-state--boxed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="sp-state__icon">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="sp-state__title">{title}</h3>
      {description ? <p className="sp-state__description">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="sp-state__actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
