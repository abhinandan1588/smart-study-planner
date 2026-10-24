import { clampPercent } from '../../utils/format';
import './Progress.css';

/** tone: primary | success | warning | danger */
export default function ProgressBar({
  value = 0,
  max = 100,
  tone = 'primary',
  size = 'md',
  showLabel = false,
  label,
  className = '',
}) {
  const percent = clampPercent(max > 0 ? (Number(value) / Number(max)) * 100 : 0);
  return (
    <div className={`sp-progress ${className}`.trim()}>
      {showLabel ? (
        <div className="sp-progress__labelrow">
          <span className="sp-progress__label">{label || 'Progress'}</span>
          <span className="sp-progress__value">{percent.toFixed(0)}%</span>
        </div>
      ) : null}
      <div
        className={`sp-progress__track sp-progress__track--${size}`}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <div
          className={`sp-progress__fill sp-progress__fill--${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
