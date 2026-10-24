import { forwardRef } from 'react';
import Field from './Field';

const Textarea = forwardRef(function Textarea(
  { label, hint, error, required = false, rows = 4, className = '', id, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
      {({ id: fieldId, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          className={`sp-control ${className}`.trim()}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required={required}
          {...rest}
        />
      )}
    </Field>
  );
});

export default Textarea;
