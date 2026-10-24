/** Wordmark glyph: an open book. Flat, two tones, no gradient. */
export default function Logo({ size = 28, tone = 'brand' }) {
  const primary = tone === 'inverse' ? '#ffffff' : 'var(--c-primary)';
  const secondary = tone === 'inverse' ? '#93b4fb' : 'var(--c-primary-border)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Smart Study Planner"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <rect width="32" height="32" rx="7" fill={primary} />
      <path
        d="M8 10.5h9.2c1.9 0 3.3 1.2 3.3 3v10.1c0-1.4-1.3-2.4-3.1-2.4H8V10.5Z"
        fill="#ffffff"
        fillOpacity="0.95"
      />
      <path
        d="M24 8.5h-5.6c-1.8 0-3.1 1.1-3.1 2.6v11.6c0-1.1 1.1-1.9 2.6-1.9H24V8.5Z"
        fill={secondary}
      />
    </svg>
  );
}
