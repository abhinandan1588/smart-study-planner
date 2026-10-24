import Button from '../../../components/ui/Button';
import DateInput from '../../../components/ui/DateInput';
import { addDays, toDateInput } from '../../../utils/date';

const PRESETS = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '365', label: 'Last 12 months', days: 365 },
];

/** `from` / `to` are the `YYYY-MM-DD` strings the admin API accepts. */
export function rangeForDays(days) {
  const today = new Date();
  return {
    from: toDateInput(addDays(today, -(days - 1))),
    to: toDateInput(today),
  };
}

/**
 * Date-range control shared by the dashboard and the reports page.
 * Presets write both dates at once; the two native pickers stay editable.
 */
export default function DateRangeFilter({ value, onChange, disabled = false }) {
  const { from = '', to = '' } = value || {};

  function applyPreset(days) {
    onChange(rangeForDays(days));
  }

  return (
    <div className="sp-adm__filters sp-adm__filters--wide">
      <DateInput
        label="From"
        value={from}
        max={to || undefined}
        disabled={disabled}
        onChange={(event) => onChange({ from: event.target.value, to })}
      />
      <DateInput
        label="To"
        value={to}
        min={from || undefined}
        disabled={disabled}
        onChange={(event) => onChange({ from, to: event.target.value })}
      />
      <div>
        <span className="sp-adm__dt">Quick ranges</span>
        <div className="sp-adm__filteractions">
          {PRESETS.map((preset) => {
            const preview = rangeForDays(preset.days);
            const active = preview.from === from && preview.to === to;
            return (
              <Button
                key={preset.key}
                size="sm"
                variant={active ? 'primary' : 'secondary'}
                disabled={disabled}
                aria-pressed={active}
                onClick={() => applyPreset(preset.days)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
