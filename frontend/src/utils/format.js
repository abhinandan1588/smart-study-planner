/** Display formatters shared by every page. */

export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '0m';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatHours(minutes) {
  const hours = (Number(minutes) || 0) / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

export function formatPercent(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  return `${num.toFixed(digits)}%`;
}

export function clampPercent(value) {
  const num = Number(value) || 0;
  return Math.min(100, Math.max(0, num));
}

export function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString();
}

export function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = num / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(value, length = 120) {
  const text = String(value || '');
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

export function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural || `${singular}s`;
}
