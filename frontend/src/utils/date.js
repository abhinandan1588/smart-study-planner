/** Date helpers. The API speaks ISO-8601 for datetimes and YYYY-MM-DD for dates. */

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function toDateTimeInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${toDateInput(date)}T${hours}:${mins}`;
}

export function todayInput() {
  return toDateInput(new Date());
}

export function formatDate(value, options) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function formatLongDate(value) {
  return formatDate(value, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatDate(date)} · ${formatTime(date)}`;
}

export function relativeFromNow(value) {
  const date = toDate(value);
  if (!date) return '—';
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'just now';
  if (abs < 60) return diffMin > 0 ? `in ${abs}m` : `${abs}m ago`;
  const hours = Math.round(abs / 60);
  if (hours < 24) return diffMin > 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return diffMin > 0 ? `in ${days}d` : `${days}d ago`;
  return formatDate(date);
}

export function startOfWeek(value, weekStartsOn = 1) {
  const date = toDate(value) || new Date();
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

export function endOfWeek(value, weekStartsOn = 1) {
  const start = startOfWeek(value, weekStartsOn);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export function addDays(value, days) {
  const date = toDate(value) || new Date();
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function eachDay(from, to) {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return [];
  const days = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function minutesBetween(from, to) {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  const a1 = toDate(aStart);
  const a2 = toDate(aEnd);
  const b1 = toDate(bStart);
  const b2 = toDate(bEnd);
  if (!a1 || !a2 || !b1 || !b2) return false;
  return a1 < b2 && b1 < a2;
}

export function isPast(value) {
  const date = toDate(value);
  return Boolean(date) && date.getTime() < Date.now();
}

export function isToday(value) {
  const date = toDate(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
