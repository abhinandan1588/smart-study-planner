import './Skeleton.css';

/** variant: text | block | circle | row — purely decorative, aria-hidden. */
export default function Skeleton({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
}) {
  const items = Array.from({ length: Math.max(1, count) });
  return (
    <div className={`sp-skeleton-group ${className}`.trim()} aria-hidden="true">
      {items.map((_, index) => (
        <span
          key={index}
          className={`sp-skeleton sp-skeleton--${variant}`}
          style={{
            width: width || undefined,
            height: height || undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Convenience: a card-shaped loading placeholder. */
export function SkeletonCard({ lines = 3, className = '' }) {
  return (
    <div className={`sp-skeleton-card ${className}`.trim()} aria-hidden="true">
      <span className="sp-skeleton sp-skeleton--text" style={{ width: '42%' }} />
      <Skeleton variant="text" count={lines} />
    </div>
  );
}

/** Convenience: table body placeholder. */
export function SkeletonRows({ rows = 5, columns = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="sp-skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex}>
              <span
                className="sp-skeleton sp-skeleton--text"
                style={{ width: colIndex === 0 ? '70%' : '48%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
