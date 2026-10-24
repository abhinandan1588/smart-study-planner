import './charts.css';

/**
 * Shared Recharts tooltip. `formatValue` turns the raw number into the unit the
 * series actually uses (minutes → `2h 15m`, counts → `3 tasks`).
 */
export default function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (value) => value,
  formatLabel = (value) => value,
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sp-charttip">
      {label !== undefined && label !== null ? (
        <p className="sp-charttip__label">{formatLabel(label)}</p>
      ) : null}
      {payload.map((entry) => (
        <div className="sp-charttip__row" key={`${entry.dataKey}-${entry.name}`}>
          <span className="sp-charttip__name">
            <span
              className="sp-chart__swatch"
              style={{ background: entry.color || entry.fill }}
              aria-hidden="true"
            />
            {entry.name}
          </span>
          <span className="sp-charttip__value">
            {formatValue(entry.value, entry)}
          </span>
        </div>
      ))}
    </div>
  );
}
