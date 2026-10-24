import Icon from './Icon';
import './Card.css';

/**
 * Compact metric: label + value + one small supporting line.
 * Capped at 110px tall on purpose — PRD 9 rules out oversized metric cards.
 */
export default function MetricTile({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  delta,
  className = '',
}) {
  const deltaDirection = Number(delta) > 0 ? 'up' : Number(delta) < 0 ? 'down' : null;
  return (
    <div className={`sp-metric sp-metric--${tone} ${className}`.trim()}>
      {icon ? (
        <span className="sp-metric__icon">
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <div className="sp-metric__body">
        <span className="sp-metric__label">{label}</span>
        <span className="sp-metric__value">{value}</span>
        {sub ? <span className="sp-metric__sub">{sub}</span> : null}
        {deltaDirection ? (
          <span className={`sp-metric__delta sp-metric__delta--${deltaDirection}`}>
            {deltaDirection === 'up' ? '▲' : '▼'} {Math.abs(Number(delta))}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
