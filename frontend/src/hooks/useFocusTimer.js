import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Derives the elapsed / remaining time of a focus session from the server's
 * own numbers instead of a local countdown, so a page refresh rebuilds the
 * timer exactly (PRD 3.6).
 *
 * The focus endpoints return `elapsed_seconds` already corrected for the
 * accumulated pause time (and frozen at `paused_at` while paused). That value
 * is the baseline; the hook only adds the wall-clock time that has passed
 * locally since it arrived, and only while the session is running.
 *
 * session: { id, status, started_at, target_minutes, elapsed_seconds,
 *            paused_accumulated_seconds }
 */
export default function useFocusTimer(session) {
  const [now, setNow] = useState(() => Date.now());
  const running = session?.status === 'running';

  // Baseline resets whenever the server hands us a fresh measurement.
  const baselineRef = useRef({ key: null, seconds: 0, at: Date.now() });
  const key = `${session?.id ?? 'none'}:${session?.status ?? 'none'}:${
    session?.elapsed_seconds ?? -1
  }`;
  if (baselineRef.current.key !== key) {
    baselineRef.current = {
      key,
      seconds: Number(session?.elapsed_seconds) || fallbackElapsed(session),
      at: Date.now(),
    };
  }

  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running, key]);

  return useMemo(() => {
    const targetSeconds = Math.max(0, (Number(session?.target_minutes) || 0) * 60);
    if (!session?.started_at) {
      return {
        elapsedSeconds: 0,
        remainingSeconds: targetSeconds,
        targetSeconds,
        percent: 0,
        display: formatClock(targetSeconds),
        elapsedDisplay: '00:00',
        isRunning: false,
        isPaused: false,
        isOver: false,
      };
    }

    const base = baselineRef.current;
    const drift = running ? Math.max(0, Math.floor((now - base.at) / 1000)) : 0;
    const elapsedSeconds = Math.max(0, base.seconds + drift);
    const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
    const percent = targetSeconds
      ? Math.min(100, (elapsedSeconds / targetSeconds) * 100)
      : 0;

    return {
      elapsedSeconds,
      remainingSeconds,
      targetSeconds,
      percent,
      display: formatClock(remainingSeconds),
      elapsedDisplay: formatClock(elapsedSeconds),
      isRunning: running,
      isPaused: session.status === 'paused',
      isOver: targetSeconds > 0 && remainingSeconds === 0,
    };
  }, [session, now, running]);
}

/** Used only when the payload carries no server-computed elapsed value. */
function fallbackElapsed(session) {
  if (!session?.started_at) return 0;
  const started = new Date(session.started_at).getTime();
  const paused = (Number(session.paused_accumulated_seconds) || 0) * 1000;
  return Math.max(0, Math.floor((Date.now() - started - paused) / 1000));
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
