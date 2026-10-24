import { forwardRef } from 'react';
import Field from './Field';
import Icon from './Icon';

/** Native <select> styled with a chevron. `options: [{ value, label }]` */
const Select = forwardRef(function Select(
  {
    label,
    hint,
    error,
    required = false,
    options = [],
    placeholder,
    size = 'md',
    className = '',
    id,
    children,
    ...rest
  },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      {({ id: fieldId, describedBy, invalid }) => (
        <div className="sp-select">
          <select
            ref={ref}
            id={fieldId}
            className={`sp-control ${size === 'sm' ? 'sp-control--sm' : ''} ${className}`.trim()}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            required={required}
            {...rest}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option
                key={String(option.value)}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
            {children}
          </select>
          <span className="sp-select__chevron">
            <Icon name="chevronDown" size={16} />
          </span>
        </div>
      )}
    </Field>
  );
});

export default Select;
