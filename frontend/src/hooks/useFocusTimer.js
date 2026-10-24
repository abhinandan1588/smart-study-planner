import { useEffect, useMemo, useState } from 'react';

/**
 * Derives the elapsed / remaining time of a focus session from the server's
 * timestamps instead of a local countdown, so a page refresh rebuilds the
 * timer exactly (PRD 3.6).
 *
 * session: { started_at, target_minutes, status, paused_accumulated_seconds }
 */
export default function useFocusTimer(session) {
  const [now, setNow] = useState(() => Date.now());

  const running = session?.status === 'running';

  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  return useMemo(() => {
    if (!session?.started_at) {
      return {
        elapsedSeconds: 0,
        remainingSeconds: 0,
        targetSeconds: 0,
        percent: 0,
        display: '00:00',
        isRunning: false,
        isPaused: false,
        isOver: false,
      };
    }

    const startedMs = new Date(session.started_at).getTime();
    const pausedSeconds = Number(session.paused_accumulated_seconds) || 0;
    const targetSeconds = Math.max(0, (Number(session.target_minutes) || 0) * 60);
    const reference = running ? now : startedMs + pausedSeconds * 1000;

    const elapsedSeconds = Math.max(
      0,
      Math.floor((reference - startedMs) / 1000) - (running ? pausedSeconds : 0),
    );
    const remainingSeconds = Math.max(0, targetSeconds - elapsedSeconds);
    const percent = targetSeconds
      ? Math.min(100, (elapsedSeconds / targetSeconds) * 100)
      : 0;

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return {
      elapsedSeconds,
      remainingSeconds,
      targetSeconds,
      percent,
      display: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      isRunning: running,
      isPaused: session.status === 'paused',
      isOver: targetSeconds > 0 && remainingSeconds === 0,
    };
  }, [session, now, running]);
}
