import { clampPercent } from '../../utils/format';
import './Progress.css';

/** SVG ring used for the focus timer and completion dials. */
export default function ProgressRing({
  value = 0,
  max = 100,
  size = 120,
  thickness = 9,
  tone = 'primary',
  label,
  caption,
  className = '',
}) {
  const percent = clampPercent(max > 0 ? (Number(value) / Number(max)) * 100 : 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      className={`sp-ring ${className}`.trim()}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={caption || 'Progress'}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle
          className="sp-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          fill="none"
        />
        <circle
          className={`sp-ring__fill sp-ring__fill--${tone}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="sp-ring__content">
        <span className="sp-ring__label">{label ?? `${percent.toFixed(0)}%`}</span>
        {caption ? <span className="sp-ring__caption">{caption}</span> : null}
      </div>
    </div>
  );
}
