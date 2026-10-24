import { useCallback, useMemo, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DateInput from '../../../components/ui/DateInput';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import IconButton from '../../../components/ui/IconButton';
import MetricTile from '../../../components/ui/MetricTile';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import GeneratorDialog from '../components/GeneratorDialog';
import SessionDialog from '../components/SessionDialog';
import useApi from '../../../hooks/useApi';
import { useAuth } from '../../../context/AuthContext';
import { timetableApi } from '../../../services/timetableApi';
import {
  addDays,
  formatDate,
  formatTime,
  isToday,
  toDateInput,
  toDateTimeInput,
} from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import {
  SESSION_STATUS_LABELS,
  SESSION_TYPE_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import './planner.css';

const VIEWS = [
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Timetable — week and day views over `GET /api/v1/student/study-sessions`,
 * with server-detected overlaps, attendance marking, reschedule and the smart
 * plan generator.
 */
export default function TimetablePage() {
  const toast = useToast();
  const { user } = useAuth();
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => toDateInput(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dialogDefaults, setDialogDefaults] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [deleteScope, setDeleteScope] = useState('single');
  const [removing, setRemoving] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(null);
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const fetchSessions = useCallback(
    () => timetableApi.listSessions({ view, date: anchor }),
    [view, anchor],
  );
  const { data, error, loading, reload } = useApi(fetchSessions);

  const conflictIds = useMemo(() => {
    const ids = new Set();
    (data?.conflicts || []).forEach((pair) =>
      pair.forEach((id) => ids.add(Number(id))),
    );
    return ids;
  }, [data]);

  function shift(direction) {
    const step = view === 'week' ? 7 : 1;
    setAnchor(toDateInput(addDays(anchor, direction * step)));
  }

  function openCreate(dateIso) {
    setEditing(null);
    if (dateIso) {
      const start = new Date(`${dateIso}T18:00:00`);
      const end = new Date(`${dateIso}T19:00:00`);
      setDialogDefaults({
        start_at: toDateTimeInput(start),
        end_at: toDateTimeInput(end),
      });
    } else {
      setDialogDefaults({});
    }
    setDialogOpen(true);
  }

  async function markAttendance(session, attended) {
    try {
      await timetableApi.markAttendance(session.id, { attended });
      toast.success(attended ? 'Marked attended' : 'Marked missed', session.title);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not update the session');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await timetableApi.deleteSession(deleting.id, { scope: deleteScope });
      toast.success('Session removed');
      setDeleting(null);
      setDeleteScope('single');
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the session');
    } finally {
      setRemoving(false);
    }
  }

  async function confirmReschedule() {
    if (!rescheduling || !rescheduleStart) return;
    setRescheduleBusy(true);
    try {
      const minutes = rescheduling.planned_minutes || 60;
      const start = new Date(rescheduleStart);
      const end = new Date(start.getTime() + minutes * 60000);
      const result = await timetableApi.rescheduleSession(rescheduling.id, {
        start_at: rescheduleStart,
        end_at: toDateTimeInput(end),
      });
      toast.success(
        result.already_rescheduled ? 'Already rescheduled' : 'Session rescheduled',
        `Now ${formatDate(result.session.start_at)} ${formatTime(result.session.start_at)}`,
      );
      setRescheduling(null);
      setRescheduleStart('');
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not reschedule');
    } finally {
      setRescheduleBusy(false);
    }
  }

  const totals = data?.totals || {};

  if (loading && !data) return <PageLoader tiles={4} cards={2} />;

  return (
    <div className="sp-page">
      <PageHeader
        title="Timetable"
        description="Plan study and revision sessions. The server rejects overlapping slots unless you confirm them."
        actions={
          <>
            <Button to="/app/planner/tasks" iconLeft="check">
              Tasks
            </Button>
            <Button iconLeft="sparkle" onClick={() => setGeneratorOpen(true)}>
              Generate plan
            </Button>
            <Button variant="primary" iconLeft="plus" onClick={() => openCreate()}>
              New session
            </Button>
          </>
        }
      />

      <div className="sp-grid sp-grid--4">
        <MetricTile
          label="Planned"
          value={formatMinutes(totals.planned_minutes)}
          sub={`${totals.sessions || 0} sessions`}
          icon="calendar"
        />
        <MetricTile
          label="Actual"
          value={formatMinutes(totals.actual_minutes)}
          sub={`${totals.completed || 0} completed`}
          icon="timer"
          tone={totals.actual_minutes > 0 ? 'success' : 'neutral'}
        />
        <MetricTile label="Breaks" value={totals.breaks || 0} icon="more" />
        <MetricTile
          label="Skipped"
          value={totals.skipped || 0}
          icon="warning"
          tone={totals.skipped > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <Card padded={false}>
        <div
          className="sp-plan__toolbar"
          style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--c-border)' }}
        >
          <Tabs items={VIEWS} active={view} onChange={setView} ariaLabel="Timetable view" />
          <div className="sp-plan__nav">
            <IconButton
              icon="chevronLeft"
              label={view === 'week' ? 'Previous week' : 'Previous day'}
              variant="outline"
              size="sm"
              onClick={() => shift(-1)}
            />
            <span className="sp-plan__range">
              {data ? `${formatDate(data.from)} – ${formatDate(data.to)}` : '—'}
            </span>
            <IconButton
              icon="chevronRight"
              label={view === 'week' ? 'Next week' : 'Next day'}
              variant="outline"
              size="sm"
              onClick={() => shift(1)}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAnchor(toDateInput(new Date()))}
            >
              Today
            </Button>
            <DateInput
              aria-label="Jump to date"
              value={anchor}
              size="sm"
              onChange={(event) => setAnchor(event.target.value)}
            />
          </div>
        </div>

        <div style={{ padding: 'var(--sp-4)' }}>
          {error ? (
            <ErrorState error={error} onRetry={reload} compact />
          ) : conflictIds.size > 0 ? (
            <div className="sp-plan__alert" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
              <div>
                <strong>
                  {data.conflicts.length} overlapping{' '}
                  {data.conflicts.length === 1 ? 'pair' : 'pairs'} in this range.
                </strong>
                <p>
                  Overlapping sessions are outlined in red. Edit or reschedule one of
                  each pair.
                </p>
              </div>
            </div>
          ) : null}

          {!error && view === 'week' ? (
            <WeekView
              days={data?.days || []}
              conflictIds={conflictIds}
              onSelect={(session) => {
                setEditing(session);
                setDialogDefaults({});
                setDialogOpen(true);
              }}
              onAdd={openCreate}
            />
          ) : null}

          {!error && view === 'day' ? (
            <DayView
              sessions={data?.items || []}
              conflictIds={conflictIds}
              onEdit={(session) => {
                setEditing(session);
                setDialogDefaults({});
                setDialogOpen(true);
              }}
              onDelete={(session) => setDeleting(session)}
              onAttendance={markAttendance}
              onReschedule={(session) => {
                setRescheduling(session);
                setRescheduleStart(toDateTimeInput(session.start_at));
              }}
              onAdd={() => openCreate(anchor)}
            />
          ) : null}
        </div>
      </Card>

      <SessionDialog
        open={dialogOpen}
        session={editing}
        defaults={dialogDefaults}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSaved={(_session, result) => {
          setDialogOpen(false);
          setEditing(null);
          if (result?.skipped_occurrences?.length) {
            toast.warning(
              'Some occurrences were skipped',
              `${result.skipped_occurrences.length} repeat dates clashed with existing sessions.`,
            );
          } else {
            toast.success(editing ? 'Session updated' : 'Session added');
          }
          reload();
        }}
      />

      <GeneratorDialog
        open={generatorOpen}
        preferences={user?.preferences}
        onClose={() => setGeneratorOpen(false)}
        onSaved={() => {
          setGeneratorOpen(false);
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this session?"
        message={
          deleting
            ? `"${deleting.title}" on ${formatDate(deleting.start_at)} will be removed.`
            : ''
        }
        details={
          deleting?.recurrence_rule || deleting?.recurrence_parent_id ? (
            <div className="sp-stack" style={{ gap: 'var(--sp-2)' }}>
              <label className="sp-check">
                <input
                  type="radio"
                  name="scope"
                  checked={deleteScope === 'single'}
                  onChange={() => setDeleteScope('single')}
                />
                <span className="sp-check__text">
                  <span>Just this session</span>
                </span>
              </label>
              <label className="sp-check">
                <input
                  type="radio"
                  name="scope"
                  checked={deleteScope === 'series'}
                  onChange={() => setDeleteScope('series')}
                />
                <span className="sp-check__text">
                  <span>The whole repeating series</span>
                </span>
              </label>
            </div>
          ) : null
        }
        confirmLabel="Delete"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => {
          setDeleting(null);
          setDeleteScope('single');
        }}
      />

      <ConfirmDialog
        open={Boolean(rescheduling)}
        tone="primary"
        title="Reschedule this session"
        message={
          rescheduling
            ? `"${rescheduling.title}" keeps its ${formatMinutes(
                rescheduling.planned_minutes,
              )} duration. The original is marked skipped and no duplicate is created.`
            : ''
        }
        details={
          <DateInput
            mode="datetime"
            label="New start"
            value={rescheduleStart}
            onChange={(event) => setRescheduleStart(event.target.value)}
          />
        }
        confirmLabel="Reschedule"
        loading={rescheduleBusy}
        onConfirm={confirmReschedule}
        onClose={() => setRescheduling(null)}
      />
    </div>
  );
}

/* --- Week grid ---------------------------------------------------------- */

function WeekView({ days, conflictIds, onSelect, onAdd }) {
  if (!days.length) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing scheduled this week"
        description="Add a session, or let the planner draft a week from your syllabus and availability."
        action={
          <Button variant="primary" size="sm" iconLeft="plus" onClick={() => onAdd()}>
            New session
          </Button>
        }
        compact
      />
    );
  }
  return (
    <div className="sp-week">
      {days.map((day, index) => (
        <div
          className={`sp-week__day ${isToday(day.date) ? 'is-today' : ''}`}
          key={day.date}
        >
          <div className="sp-week__dayhead">
            <span className="sp-week__dayname">
              {DAY_NAMES[index % 7] || formatDate(day.date, { weekday: 'short' })}
            </span>
            <span className="sp-week__daynum">
              {formatDate(day.date, { month: undefined, year: undefined })}
            </span>
          </div>
          {day.sessions.map((session) => (
            <SessionChip
              key={session.id}
              session={session}
              conflicted={conflictIds.has(session.id)}
              onSelect={onSelect}
            />
          ))}
          <div className="sp-week__add">
            <Button
              size="sm"
              variant="ghost"
              iconLeft="plus"
              fullWidth
              onClick={() => onAdd(day.date)}
            >
              Add
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionChip({ session, conflicted, onSelect }) {
  return (
    <button
      type="button"
      className={[
        'sp-session',
        `sp-session--${session.session_type}`,
        `is-${session.status}`,
        conflicted ? 'is-conflicted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(session)}
      aria-label={`${session.title}, ${formatTime(session.start_at)} to ${formatTime(
        session.end_at,
      )}, ${labelFor(SESSION_STATUS_LABELS, session.status)}`}
    >
      <span className="sp-session__time">
        {formatTime(session.start_at)} – {formatTime(session.end_at)}
      </span>
      <span className="sp-session__title">{session.title}</span>
      <span className="sp-session__meta">
        {session.course_title || labelFor(SESSION_TYPE_LABELS, session.session_type)}
      </span>
    </button>
  );
}

/* --- Day list ----------------------------------------------------------- */

function DayView({
  sessions,
  conflictIds,
  onEdit,
  onDelete,
  onAttendance,
  onReschedule,
  onAdd,
}) {
  if (!sessions.length) {
    return (
      <EmptyState
        icon="calendar"
        title="No sessions on this day"
        description="Add one, or move a missed session here from another day."
        action={
          <Button variant="primary" size="sm" iconLeft="plus" onClick={onAdd}>
            New session
          </Button>
        }
        compact
      />
    );
  }
  return (
    <div className="sp-day">
      {sessions.map((session) => (
        <div
          className={`sp-day__row ${conflictIds.has(session.id) ? 'is-conflicted' : ''}`}
          key={session.id}
          style={
            conflictIds.has(session.id)
              ? { borderColor: 'var(--c-danger)' }
              : undefined
          }
        >
          <div>
            <span className="sp-day__time">{formatTime(session.start_at)}</span>
            <span className="sp-session__meta">
              {formatMinutes(session.planned_minutes)}
            </span>
          </div>
          <div>
            <span className="sp-task__name">{session.title}</span>
            <span className="sp-task__sub">
              {labelFor(SESSION_TYPE_LABELS, session.session_type)}
              {session.course_title ? ` · ${session.course_title}` : ''}
              {session.topic_title ? ` · ${session.topic_title}` : ''}
              {session.actual_minutes
                ? ` · ${formatMinutes(session.actual_minutes)} recorded`
                : ''}
            </span>
          </div>
          <div className="sp-day__actions">
            <Badge tone={statusTone(session.status)} size="sm">
              {labelFor(SESSION_STATUS_LABELS, session.status)}
            </Badge>
            {session.status === 'planned' ? (
              <>
                <Button size="sm" iconLeft="check" onClick={() => onAttendance(session, true)}>
                  Attended
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAttendance(session, false)}>
                  Missed
                </Button>
              </>
            ) : null}
            {session.status === 'skipped' ? (
              <Button size="sm" iconLeft="refresh" onClick={() => onReschedule(session)}>
                Reschedule
              </Button>
            ) : null}
            <IconButton
              icon="edit"
              size="sm"
              label={`Edit ${session.title}`}
              onClick={() => onEdit(session)}
            />
            <IconButton
              icon="trash"
              size="sm"
              label={`Delete ${session.title}`}
              onClick={() => onDelete(session)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
