import { forwardRef } from 'react';
import Input from './Input';

/**
 * Native date / datetime-local / time picker.
 * `mode: 'date' | 'datetime' | 'time'` — the browser supplies the calendar,
 * which keeps keyboard and screen-reader behaviour native.
 *
 * Values are the HTML input formats the API accepts directly:
 * `YYYY-MM-DD` for dates and `YYYY-MM-DDTHH:mm` for datetimes.
 */
const TYPES = { date: 'date', datetime: 'datetime-local', time: 'time' };

const DateInput = forwardRef(function DateInput({ mode = 'date', ...rest }, ref) {
  return <Input ref={ref} type={TYPES[mode] || 'date'} {...rest} />;
});

export default DateInput;
