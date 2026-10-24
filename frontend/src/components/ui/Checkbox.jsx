import { forwardRef } from 'react';
import './Field.css';

const Checkbox = forwardRef(function Checkbox(
  { label, description, disabled = false, className = '', type = 'checkbox', ...rest },
  ref,
) {
  return (
    <label
      className={[
        'sp-check',
        disabled ? 'sp-check--disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input ref={ref} type={type} disabled={disabled} {...rest} />
      <span className="sp-check__text">
        <span>{label}</span>
        {description ? <span className="sp-check__desc">{description}</span> : null}
      </span>
    </label>
  );
});

export default Checkbox;
