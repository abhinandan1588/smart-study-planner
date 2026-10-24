import { useId, useState } from 'react';
import './Tooltip.css';

/** Shows on hover and on keyboard focus, linked with aria-describedby. */
export default function Tooltip({ content, placement = 'top', children, className = '' }) {
  const [visible, setVisible] = useState(false);
  const id = `tip-${useId()}`;

  if (!content) return children;

  return (
    <span
      className={`sp-tooltip ${className}`.trim()}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible ? (
        <span className={`sp-tooltip__bubble sp-tooltip__bubble--${placement}`} role="tooltip" id={id}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
