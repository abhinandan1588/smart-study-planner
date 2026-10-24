import { useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import IconButton from '../../../components/ui/IconButton';
import Input from '../../../components/ui/Input';
import MetricTile from '../../../components/ui/MetricTile';
import { useToast } from '../../../components/ui/ToastProvider';
import { studentApi } from '../../../services/studentApi';
import { timetableApi } from '../../../services/timetableApi';
import { addDays, formatDate, formatTime, toDateInput } from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import { SESSION_TYPE_LABELS, labelFor } from '../../../utils/constants';
import '../pages/planner.css';

const REASON_LABELS = {
  no_capacity: 'no free slot in the range',
  after_deadline: 'only fits after its deadline',
};

/**
 * Smart timetable generator (PRD 3.5).
 *
 * Step 1 collects preferences, step 2 previews the draft the deterministic
 * backend scheduler returned. Nothing is stored until the student accepts, and
 * rows can be dropped from the draft first.
 */
export default function GeneratorDialog({ open, onClose, onSaved, preferences }) {
  const toast = useToast();
  const [step, setStep] = useState('form');
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(() => ({
    from: toDateInput(new Date()),
    to: toDateInput(addDays(new Date(), 6)),
    course_ids: [],
    include_breaks: true,
    include_revision: true,
    include_tasks: true,
    daily_target_minutes: '',
  }));
  const [draft, setDraft] = useState(null);
  const [dropped, setDropped] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveConflicts, setSaveConflicts] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setDraft(null);
    setDropped([]);
    setSaveConflicts(null);
    setFieldErrors({});
    setForm((current) => ({
      ...current,
      from: toDateInput(new Date()),
      to: toDateInput(addDays(new Date(), 6)),
      daily_target_minutes: preferences?.daily_target_minutes
        ? String(preferences.daily_target_minutes)
        : '',
    }));
  }, [open, preferences]);

  useEffect(() => {
    if (!open) return;
    studentApi
      .listEnrollments({ status: 'active' })
      .then((payload) => setCourses(payload.items || []))
      .catch(() => setCourses([]));
  }, [open]);

  function toggleCourse(courseId) {
    setForm((current) => ({
      ...current,
      course_ids: current.course_ids.includes(courseId)
        ? current.course_ids.filter((id) => id !== courseId)
        : [...current.course_ids, courseId],
    }));
  }

  async function generate(event) {
    event?.preventDefault();
    setBusy(true);
    setFieldErrors({});
    try {
      const payload = await timetableApi.generate({
        from: form.from,
        to: form.to,
        course_ids: form.course_ids,
        include_breaks: form.include_breaks,
        include_revision: form.include_revision,
        include_tasks: form.include_tasks,
        daily_target_minutes: form.daily_target_minutes
          ? Number(form.daily_target_minutes)
          : null,
      });
      setDraft(payload);
      setDropped([]);
      setStep('preview');
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not build a plan');
      }
    } finally {
      setBusy(false);
    }
  }

  const keptSessions = (draft?.sessions || []).filter(
    (_, index) => !dropped.includes(index),
  );

  async function persist() {
    if (!draft || keptSessions.length === 0) return;
    setBusy(true);
    setSaveConflicts(null);
    try {
      const result = await timetableApi.saveGenerated({
        batch_id: draft.batch_id,
        sessions: keptSessions.map((item) => ({
          title: item.title,
          session_type: item.session_type,
          start_at: item.start_at,
          end_at: item.end_at,
          course_id: item.course_id,
          subject_id: item.subject_id,
          topic_id: item.topic_id,
        })),
      });
      toast.success(
        'Plan saved',
        `${result.created} ${result.created === 1 ? 'session' : 'sessions'} added to your timetable.`,
      );
      onSaved?.(result);
    } catch (caught) {
      if (caught.status === 409 && caught.extra?.conflicts) {
        setSaveConflicts(caught.extra.conflicts);
      } else {
        toast.apiError(caught, 'Could not save the plan');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Generate a study plan"
      description={
        step === 'form'
          ? 'The planner fills your free windows with incomplete topics, revisions and due tasks.'
          : 'Review the draft. Nothing is stored until you accept it.'
      }
      footer={
        step === 'form' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="sp-generator-form"
              loading={busy}
              iconLeft="sparkle"
            >
              Build draft plan
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep('form')} disabled={busy}>
              Back
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={keptSessions.length === 0}
              onClick={persist}
            >
              Accept and save {keptSessions.length || 0}
            </Button>
          </>
        )
      }
    >
      {step === 'form' ? (
        <form id="sp-generator-form" className="sp-stack" onSubmit={generate} noValidate>
          <div className="sp-grid sp-grid--2">
            <DateInput
              label="From"
              required
              value={form.from}
              error={fieldErrors.from}
              onChange={(event) =>
                setForm((current) => ({ ...current, from: event.target.value }))
              }
            />
            <DateInput
              label="To"
              required
              value={form.to}
              error={fieldErrors.to}
              onChange={(event) =>
                setForm((current) => ({ ...current, to: event.target.value }))
              }
            />
          </div>
          <Input
            type="number"
            label="Daily study target (minutes)"
            min={15}
            max={1440}
            value={form.daily_target_minutes}
            error={fieldErrors.daily_target_minutes}
            hint="Defaults to the target in Profile & Settings"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                daily_target_minutes: event.target.value,
              }))
            }
          />
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sp-dash__statlabel">Courses to plan</legend>
            <div className="sp-stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              {courses.length === 0 ? (
                <p className="sp-muted">
                  No active enrollments. Enroll in a course first.
                </p>
              ) : (
                courses.map((enrollment) => (
                  <Checkbox
                    key={enrollment.course_id}
                    label={enrollment.course?.title || `Course ${enrollment.course_id}`}
                    description={`${enrollment.progress?.completed_topics || 0} of ${
                      enrollment.progress?.total_topics || 0
                    } topics complete`}
                    checked={form.course_ids.includes(enrollment.course_id)}
                    onChange={() => toggleCourse(enrollment.course_id)}
                  />
                ))
              )}
              <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                Leave all unchecked to plan across every active course.
              </p>
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sp-dash__statlabel">Include</legend>
            <div className="sp-stack" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
              <Checkbox
                label="Breaks between blocks"
                checked={form.include_breaks}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    include_breaks: event.target.checked,
                  }))
                }
              />
              <Checkbox
                label="Revision for topics due for review"
                checked={form.include_revision}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    include_revision: event.target.checked,
                  }))
                }
              />
              <Checkbox
                label="Incomplete tasks with a due date"
                checked={form.include_tasks}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    include_tasks: event.target.checked,
                  }))
                }
              />
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="sp-stack">
          {saveConflicts ? (
            <div className="sp-plan__alert" role="alert">
              <div>
                <strong>Some rows clash with sessions already in your timetable.</strong>
                <ul style={{ marginTop: 'var(--sp-2)' }}>
                  {saveConflicts.map((conflict) => (
                    <li key={conflict.index}>
                      {conflict.title} · {formatDate(conflict.start_at)}{' '}
                      {formatTime(conflict.start_at)}
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: 'var(--sp-2)' }}>
                  Remove those rows below and save again — the batch is all-or-nothing.
                </p>
              </div>
            </div>
          ) : null}

          <div className="sp-gen__summary">
            <MetricTile
              label="Study blocks"
              value={draft?.summary?.session_count || 0}
              icon="calendar"
            />
            <MetricTile
              label="Breaks"
              value={draft?.summary?.break_count || 0}
              icon="timer"
            />
            <MetricTile
              label="Planned time"
              value={formatMinutes(draft?.summary?.planned_minutes)}
              icon="analytics"
            />
            <MetricTile
              label="Not scheduled"
              value={draft?.summary?.unscheduled_count || 0}
              icon="warning"
              tone={draft?.summary?.unscheduled_count ? 'warning' : 'neutral'}
            />
          </div>

          {draft?.sessions?.length ? (
            <div className="sp-gen__preview">
              {draft.sessions.map((item, index) => {
                const removed = dropped.includes(index);
                return (
                  <div
                    className="sp-gen__row"
                    key={`${item.start_at}-${item.title}-${index}`}
                    style={removed ? { opacity: 0.45 } : undefined}
                  >
                    <span>
                      {formatDate(item.start_at, { year: undefined })}{' '}
                      {formatTime(item.start_at)}
                    </span>
                    <span
                      style={
                        removed ? { textDecoration: 'line-through' } : undefined
                      }
                    >
                      {item.title}
                    </span>
                    <Badge
                      size="sm"
                      tone={item.session_type === 'break' ? 'neutral' : 'primary'}
                    >
                      {labelFor(SESSION_TYPE_LABELS, item.session_type)} ·{' '}
                      {formatMinutes(item.planned_minutes)}
                    </Badge>
                    <IconButton
                      icon={removed ? 'refresh' : 'trash'}
                      size="sm"
                      label={
                        removed
                          ? `Restore ${item.title}`
                          : `Remove ${item.title} from the draft`
                      }
                      onClick={() =>
                        setDropped((current) =>
                          current.includes(index)
                            ? current.filter((value) => value !== index)
                            : [...current, index],
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon="calendar"
              title="Nothing could be scheduled"
              description="There were no free windows in this range, or no incomplete topics left. Widen the range or update your availability in Profile & Settings."
              compact
            />
          )}

          {draft?.unscheduled?.length ? (
            <div className="sp-gen__unscheduled">
              <strong>Could not place {draft.unscheduled.length}:</strong>
              <ul>
                {draft.unscheduled.slice(0, 8).map((item, index) => (
                  <li key={`${item.topic_id || item.task_id}-${index}`}>
                    {item.title} — {REASON_LABELS[item.reason] || item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
