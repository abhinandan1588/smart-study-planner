import { forwardRef } from 'react';
import Field from './Field';
import Icon from './Icon';

const Input = forwardRef(function Input(
  {
    label,
    hint,
    error,
    required = false,
    iconLeft,
    suffix,
    size = 'md',
    className = '',
    fieldClassName = '',
    labelAction,
    id,
    ...rest
  },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      id={id}
      labelAction={labelAction}
      className={fieldClassName}
    >
      {({ id: fieldId, describedBy, invalid }) => (
        <div
          className={[
            'sp-input',
            iconLeft ? 'sp-input--with-icon' : '',
            suffix ? 'sp-input--with-suffix' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {iconLeft ? (
            <span className="sp-input__icon">
              <Icon name={iconLeft} size={16} />
            </span>
          ) : null}
          <input
            ref={ref}
            id={fieldId}
            className={`sp-control ${size === 'sm' ? 'sp-control--sm' : ''} ${className}`.trim()}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            required={required}
            {...rest}
          />
          {suffix ? <span className="sp-input__suffix">{suffix}</span> : null}
        </div>
      )}
    </Field>
  );
});

export default Input;
