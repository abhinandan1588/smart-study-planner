import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Input from '../../../components/ui/Input';
import MetricTile from '../../../components/ui/MetricTile';
import Pagination from '../../../components/ui/Pagination';
import ProgressRing from '../../../components/ui/ProgressRing';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/ToastProvider';
import BarChartCard from '../../../components/charts/BarChartCard';
import useApi from '../../../hooks/useApi';
import useFocusTimer from '../../../hooks/useFocusTimer';
import usePagination from '../../../hooks/usePagination';
import { useAuth } from '../../../context/AuthContext';
import { focusApi } from '../../../services/focusApi';
import { studentApi } from '../../../services/studentApi';
import { syllabusApi } from '../../../services/syllabusApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import { FOCUS_STATUS_LABELS, labelFor, statusTone } from '../../../utils/constants';
import './focus.css';

const PRESETS = [25, 45, 50, 90];

/**
 * Focus timer (PRD 3.6).
 *
 * The server owns the clock: `POST /student/focus-sessions` records
 * `started_at`, `PATCH .../:id` applies pause / resume / complete / stop and
 * recomputes the real duration, and `GET /student/focus-sessions/active`
 * rebuilds the countdown after a page refresh.
 */
export default function FocusTimerPage() {
  const toast = useToast();
  const { user } = useAuth();
  const prefs = user?.preferences || {};

  const [session, setSession] = useState(null);
  const [recovered, setRecovered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(String(prefs.focus_duration_minutes || 25));
  const [mode, setMode] = useState('pomodoro');
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [stopOpen, setStopOpen] = useState(false);
  const [breakEndsAt, setBreakEndsAt] = useState(null);
  const [breakRemaining, setBreakRemaining] = useState(0);
  const notifiedRef = useRef(false);

  const pager = usePagination({ perPage: 10 });

  const fetchActive = useCallback(() => focusApi.active(), []);
  const {
    error: activeError,
    loading: activeLoading,
    reload: reloadActive,
  } = useApi(fetchActive, {
    onSuccess: (payload) => {
      setSession(payload.session || null);
      setRecovered(Boolean(payload.session));
    },
  });

  const fetchHistory = useCallback(
    () => focusApi.history({ page: pager.page, per_page: pager.perPage }),
    [pager.page, pager.perPage],
  );
  const {
    data: history,
    error: historyError,
    loading: historyLoading,
    reload: reloadHistory,
  } = useApi(fetchHistory, { onSuccess: (payload) => pager.applyMeta(payload) });

  const fetchSummary = useCallback(() => focusApi.summary(), []);
  const { data: summary, reload: reloadSummary } = useApi(fetchSummary);

  const timer = useFocusTimer(session);

  useEffect(() => {
    studentApi
      .listEnrollments({ status: 'active' })
      .then((payload) =>
        setCourses(
          (payload.items || []).map((item) => ({
            value: String(item.course_id),
            label: item.course?.title || `Course ${item.course_id}`,
          })),
        ),
      )
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setTopics([]);
      setTopicId('');
      return;
    }
    let cancelled = false;
    syllabusApi
      .forCourse(courseId)
      .then((tree) => {
        if (cancelled) return;
        const options = [];
        const walk = (unit, subjectName) => {
          (unit.topics || []).forEach((topic) =>
            options.push({
              value: String(topic.id),
              label: `${subjectName} · ${topic.title}`,
            }),
          );
          (unit.children || []).forEach((child) => walk(child, subjectName));
        };
        (tree.subjects || []).forEach((subject) =>
          (subject.units || []).forEach((unit) => walk(unit, subject.name)),
        );
        setTopics(options);
      })
      .catch(() => setTopics([]));
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Notify once when the target is reached; the server still validates the
  // duration when the session is completed.
  useEffect(() => {
    if (!session || session.status !== 'running') {
      notifiedRef.current = false;
      return;
    }
    if (timer.isOver && !notifiedRef.current) {
      notifiedRef.current = true;
      toast.success('Target reached', 'Complete the session to record it.');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Focus target reached', {
          body: 'Complete the session to record your focus time.',
        });
      }
    }
  }, [timer.isOver, session, toast]);

  // Break countdown after a completed cycle (local only — no server record).
  useEffect(() => {
    if (!breakEndsAt) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.round((breakEndsAt - Date.now()) / 1000));
      setBreakRemaining(remaining);
      if (remaining === 0) setBreakEndsAt(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [breakEndsAt]);

  async function start() {
    setBusy(true);
    try {
      const payload = await focusApi.start({
        mode,
        target_minutes: Number(target),
        course_id: courseId ? Number(courseId) : null,
        topic_id: topicId ? Number(topicId) : null,
      });
      setSession(payload.session);
      setRecovered(false);
      setBreakEndsAt(null);
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission().catch(() => {});
      }
    } catch (caught) {
      if (caught.status === 409 && caught.extra?.session) {
        setSession(caught.extra.session);
        setRecovered(true);
        toast.warning('A session is already running', 'Recovered it from the server.');
      } else {
        toast.apiError(caught, 'Could not start the timer');
      }
    } finally {
      setBusy(false);
    }
  }

  async function act(action) {
    if (!session) return;
    setBusy(true);
    try {
      const payload = await focusApi.action(session.id, action);
      const next = payload.session;
      if (['completed', 'interrupted', 'abandoned'].includes(next.status)) {
        setSession(null);
        setRecovered(false);
        if (next.status === 'completed') {
          toast.success(
            'Session recorded',
            `${formatMinutes(next.focus_minutes)} of focus time.`,
          );
          const breakMinutes =
            (next.cycles_completed || 0) % 4 === 0
              ? prefs.long_break_minutes || 15
              : prefs.short_break_minutes || 5;
          if (breakMinutes > 0) setBreakEndsAt(Date.now() + breakMinutes * 60000);
        } else if (next.status === 'interrupted') {
          toast.warning(
            'Stored as interrupted',
            `Only ${formatMinutes(next.focus_minutes)} elapsed, below the completion threshold.`,
          );
        } else {
          toast.info('Session discarded', 'No focus time was recorded.');
        }
        if (payload.achievements_earned?.length) {
          toast.success(
            'Achievement unlocked',
            payload.achievements_earned
              .map((item) => item.title || item.code)
              .join(', '),
          );
        }
        reloadHistory();
        reloadSummary();
      } else {
        setSession(next);
      }
    } catch (caught) {
      toast.apiError(caught, 'Could not update the session');
      reloadActive();
    } finally {
      setBusy(false);
    }
  }

  if (activeLoading && !session && !recovered) return <PageLoader tiles={3} cards={2} />;

  const totals = history?.totals || {};
  const live = Boolean(session);

  return (
    <div className="sp-page">
      <PageHeader
        title="Focus Timer"
        description="Pomodoro and custom focus blocks. Durations are validated on the server, so a refresh never loses a running session."
        actions={
          <Button iconLeft="analytics" to="/app/analytics">
            Analytics
          </Button>
        }
      />

      <div className="sp-grid sp-grid--4">
        <MetricTile
          label="Focus today"
          value={formatMinutes(totals.today_minutes)}
          icon="timer"
          tone={totals.today_minutes > 0 ? 'success' : 'neutral'}
        />
        <MetricTile
          label="Total focus time"
          value={formatMinutes(totals.total_minutes)}
          icon="analytics"
        />
        <MetricTile
          label="Cycles completed"
          value={totals.cycles_completed || 0}
          icon="flame"
        />
        <MetricTile
          label="Sessions recorded"
          value={totals.session_count || 0}
          icon="check"
        />
      </div>

      {activeError ? <ErrorState error={activeError} onRetry={reloadActive} boxed /> : null}

      <div className="sp-focus">
        <div className="sp-focus__col">
          <Card
            title={live ? 'Session in progress' : 'Start a focus session'}
            subtitle={
              live
                ? `Started ${formatDateTime(session.started_at)}`
                : 'Pick a duration and, optionally, what you are working on'
            }
          >
            {live && recovered ? (
              <div className="sp-focus__recovered" role="status">
                <div>
                  <strong>Recovered a running session.</strong>
                  <p>
                    The clock was rebuilt from the server's start time, so the
                    elapsed time below is the real one.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="sp-focus__stage">
              <ProgressRing
                value={timer.elapsedSeconds}
                max={timer.targetSeconds || 1}
                size={200}
                thickness={12}
                tone={
                  timer.isPaused
                    ? 'warning'
                    : timer.isOver
                      ? 'success'
                      : 'primary'
                }
                label={
                  <span className="sp-focus__clock">
                    {live ? timer.display : `${target || 0}:00`}
                  </span>
                }
                caption={
                  live
                    ? timer.isPaused
                      ? 'paused'
                      : timer.isOver
                        ? 'target reached'
                        : 'remaining'
                    : 'ready'
                }
              />

              {live ? (
                <p className="sp-focus__clocklabel">
                  {timer.elapsedDisplay} elapsed of{' '}
                  {formatMinutes(session.target_minutes)} target
                  {session.topic_title ? ` · ${session.topic_title}` : ''}
                  {session.course_title && !session.topic_title
                    ? ` · ${session.course_title}`
                    : ''}
                </p>
              ) : null}

              <div className="sp-focus__controls">
                {!live ? (
                  <Button
                    variant="primary"
                    iconLeft="timer"
                    loading={busy}
                    disabled={!target}
                    onClick={start}
                  >
                    Start focus
                  </Button>
                ) : (
                  <>
                    {session.status === 'running' ? (
                      <Button iconLeft="more" loading={busy} onClick={() => act('pause')}>
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        iconLeft="timer"
                        loading={busy}
                        onClick={() => act('resume')}
                      >
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      iconLeft="check"
                      loading={busy}
                      onClick={() => act('complete')}
                    >
                      Complete
                    </Button>
                    <Button variant="danger" iconLeft="close" onClick={() => setStopOpen(true)}>
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!live ? (
              <div className="sp-stack">
                <div className="sp-focus__presets" role="group" aria-label="Duration presets">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="sp-focus__preset"
                      aria-pressed={Number(target) === preset}
                      onClick={() => {
                        setTarget(String(preset));
                        setMode(preset === 25 ? 'pomodoro' : 'custom');
                      }}
                    >
                      {preset} min
                    </button>
                  ))}
                </div>
                <div className="sp-focus__setup">
                  <Input
                    type="number"
                    label="Focus length (minutes)"
                    min={5}
                    max={240}
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    hint="Server accepts 5–240 minutes"
                  />
                  <Select
                    label="Mode"
                    options={[
                      { value: 'pomodoro', label: 'Pomodoro' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                  />
                  <Select
                    label="Course"
                    placeholder="No course"
                    options={courses}
                    value={courseId}
                    onChange={(event) => setCourseId(event.target.value)}
                  />
                  <Select
                    label="Topic"
                    placeholder={courseId ? 'No topic' : 'Pick a course first'}
                    options={topics}
                    value={topicId}
                    disabled={!courseId || topics.length === 0}
                    onChange={(event) => setTopicId(event.target.value)}
                  />
                </div>
                <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  Breaks use your preferences: {prefs.short_break_minutes ?? 5} min short,{' '}
                  {prefs.long_break_minutes ?? 15} min long. Change them in Profile &
                  Settings.
                </p>
              </div>
            ) : null}

            {breakEndsAt ? (
              <div className="sp-focus__break" role="status">
                <Badge tone="success">Break</Badge>
                <span>
                  {Math.floor(breakRemaining / 60)}:
                  {String(breakRemaining % 60).padStart(2, '0')} left
                </span>
                <Button size="sm" variant="ghost" onClick={() => setBreakEndsAt(null)}>
                  Skip break
                </Button>
              </div>
            ) : null}
          </Card>

          <BarChartCard
            title="Focus time, last 14 days"
            subtitle="From your stored focus sessions"
            data={summary?.daily || []}
            series={[{ key: 'minutes', name: 'Focus minutes' }]}
            xKey="date"
            height={200}
            formatValue={(value) => formatMinutes(value)}
            formatAxisValue={(value) => `${value}m`}
            formatLabel={(value) => formatDate(value, { year: undefined })}
            emptyTitle="No focus sessions yet"
            emptyDescription="Run your first focus block and this chart starts filling in."
          />
        </div>

        <div className="sp-focus__col">
          <Card
            title="Session history"
            subtitle="Completed, interrupted and abandoned sessions are kept distinct"
            actions={
              <Button size="sm" variant="ghost" iconLeft="refresh" onClick={reloadHistory}>
                Refresh
              </Button>
            }
          >
            {historyError ? (
              <ErrorState error={historyError} onRetry={reloadHistory} compact />
            ) : historyLoading && !history ? (
              <Skeleton variant="text" count={5} />
            ) : history?.items?.length ? (
              <>
                <ul>
                  {history.items.map((item) => (
                    <li className="sp-focus__historyrow" key={item.id}>
                      <div>
                        <p className="sp-task__name">
                          {formatMinutes(item.focus_minutes)} focus
                          <span className="sp-muted">
                            {' '}
                            / {formatMinutes(item.target_minutes)} target
                          </span>
                        </p>
                        <p className="sp-task__sub">
                          {formatDateTime(item.started_at)}
                          {item.topic_title ? ` · ${item.topic_title}` : ''}
                          {item.course_title && !item.topic_title
                            ? ` · ${item.course_title}`
                            : ''}
                        </p>
                      </div>
                      <Badge tone={statusTone(item.status)} size="sm">
                        {labelFor(FOCUS_STATUS_LABELS, item.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 'var(--sp-4)' }}>
                  <Pagination
                    page={pager.meta.page}
                    pages={pager.meta.pages}
                    total={pager.meta.total}
                    perPage={pager.meta.per_page}
                    onPageChange={pager.setPage}
                    label="sessions"
                  />
                </div>
              </>
            ) : (
              <EmptyState
                icon="timer"
                title="No sessions yet"
                description="Start a focus block above — every completed session is validated and stored."
                compact
              />
            )}
          </Card>

          {summary?.today ? (
            <Card title="Today" subtitle="Focus activity recorded today">
              <dl className="sp-deflist">
                <dt>Focus time</dt>
                <dd>{formatMinutes(summary.today.minutes)}</dd>
                <dt>Sessions</dt>
                <dd>{summary.today.sessions}</dd>
                <dt>Cycles completed</dt>
                <dd>{summary.today.cycles}</dd>
              </dl>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={stopOpen}
        title="Stop this session?"
        message={
          timer.percent >= 90
            ? 'You have passed the completion threshold, so this will be recorded as a completed session.'
            : 'Less than 90% of the target has elapsed, so the server will store this as an interrupted session rather than a completed one.'
        }
        confirmLabel="Stop session"
        loading={busy}
        onConfirm={async () => {
          setStopOpen(false);
          await act('stop');
        }}
        onClose={() => setStopOpen(false)}
      />
    </div>
  );
}
