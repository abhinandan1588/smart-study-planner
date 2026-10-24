import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import Input from '../../../components/ui/Input';
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Tabs from '../../../components/ui/Tabs';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { goalsApi } from '../../../services/goalsApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate, toDateInput, todayInput } from '../../../utils/date';
import { formatNumber, formatPercent } from '../../../utils/format';
import {
  GOAL_CATEGORY_LABELS,
  GOAL_CATEGORY_OPTIONS,
  GOAL_STATUS_LABELS,
  labelFor,
  optionsFrom,
  statusTone,
} from '../../../utils/constants';
import './goals.css';

const UNIT_OPTIONS = optionsFrom({
  topics: 'Topics',
  hours: 'Hours',
  days: 'Days',
  questions: 'Questions',
  tasks: 'Tasks',
});

/** Categories the server cannot derive from stored activity. */
const MANUAL_CATEGORIES = ['practice_questions'];

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
  { key: 'overdue', label: 'Overdue' },
  { key: '', label: 'All' },
];

function emptyForm() {
  return {
    title: '',
    description: '',
    category: 'topics_count',
    target_value: '',
    unit: 'topics',
    start_date: todayInput(),
    deadline: '',
    course_id: '',
  };
}

/**
 * Goals and achievements (PRD 3.7).
 *
 * `GET /api/v1/student/goals` recomputes `current_value` from stored activity
 * on every read, so progress here is never client-supplied. Achievements come
 * from `GET /student/achievements` with earned and locked entries.
 */
export default function GoalsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [reporting, setReporting] = useState(null);
  const [increment, setIncrement] = useState('1');

  const fetchGoals = useCallback(() => goalsApi.list({ status }), [status]);
  const { data, error, loading, reload } = useApi(fetchGoals);

  const fetchAchievements = useCallback(() => goalsApi.achievements(), []);
  const {
    data: achievements,
    error: achievementsError,
    loading: achievementsLoading,
    reload: reloadAchievements,
  } = useApi(fetchAchievements);

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

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(goal) {
    setEditing(goal);
    setForm({
      title: goal.title || '',
      description: goal.description || '',
      category: goal.category,
      target_value: String(goal.target_value ?? ''),
      unit: goal.unit || '',
      start_date: toDateInput(goal.start_date),
      deadline: toDateInput(goal.deadline),
      course_id: goal.course_id ? String(goal.course_id) : '',
    });
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      target_value: Number(form.target_value),
      unit: form.unit || null,
      start_date: form.start_date || null,
      deadline: form.deadline,
    };
    if (!editing) {
      payload.category = form.category;
      payload.course_id = form.course_id ? Number(form.course_id) : null;
    }
    try {
      if (editing) await goalsApi.update(editing.id, payload);
      else await goalsApi.create(payload);
      toast.success(editing ? 'Goal updated' : 'Goal created');
      setDialogOpen(false);
      setEditing(null);
      reload();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not save the goal');
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePause(goal) {
    try {
      await goalsApi.update(goal.id, {
        status: goal.status === 'paused' ? 'active' : 'paused',
      });
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not update the goal');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await goalsApi.remove(deleting.id);
      toast.success('Goal deleted');
      setDeleting(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the goal');
    } finally {
      setRemoving(false);
    }
  }

  async function reportProgress() {
    if (!reporting) return;
    setSaving(true);
    try {
      await goalsApi.refreshProgress(reporting.id, {
        increment: Number(increment) || 1,
      });
      toast.success('Progress recorded');
      setReporting(null);
      setIncrement('1');
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not record progress');
    } finally {
      setSaving(false);
    }
  }

  const counts = data?.counts || {};
  const goals = data?.items || [];

  if (loading && !data) return <PageLoader tiles={4} cards={2} />;

  return (
    <div className="sp-page">
      <PageHeader
        title="Goals & Achievements"
        description="Targets tracked from your stored activity, and the achievements they unlock."
        actions={
          <Button variant="primary" iconLeft="plus" onClick={openCreate}>
            New goal
          </Button>
        }
      />

      <div className="sp-grid sp-grid--4">
        <MetricTile label="Active" value={counts.active || 0} icon="target" />
        <MetricTile
          label="Completed"
          value={counts.completed || 0}
          icon="check"
          tone="success"
        />
        <MetricTile
          label="Overdue"
          value={counts.overdue || 0}
          icon="warning"
          tone={counts.overdue > 0 ? 'danger' : 'neutral'}
        />
        <MetricTile
          label="Achievements earned"
          value={achievements ? achievements.earned.length : '—'}
          sub={
            achievements
              ? `of ${achievements.earned.length + achievements.available.length}`
              : undefined
          }
          icon="flame"
          tone="primary"
        />
      </div>

      <Tabs
        items={TABS.map((item) => ({
          ...item,
          count: item.key ? counts[item.key] : undefined,
        }))}
        active={status}
        onChange={setStatus}
        ariaLabel="Goal status"
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} boxed />
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="target"
            title="No goals in this view"
            description="Set a target — finish a course, complete N topics, study X hours a week or hold a streak — and the server tracks it from your activity."
            action={
              <Button variant="primary" iconLeft="plus" onClick={openCreate}>
                Create a goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="sp-goals__grid">
          {goals.map((goal) => (
            <article className="sp-goalcard" key={goal.id}>
              <div className="sp-goalcard__head">
                <span className="sp-goalcard__title">{goal.title}</span>
                <Badge tone={statusTone(goal.status)} size="sm">
                  {labelFor(GOAL_STATUS_LABELS, goal.status)}
                </Badge>
              </div>
              {goal.description ? (
                <p className="sp-goalcard__desc">{goal.description}</p>
              ) : null}
              <ProgressBar
                value={goal.progress_percent}
                showLabel
                label={`${formatNumber(goal.current_value)} / ${formatNumber(
                  goal.target_value,
                )} ${goal.unit || ''}`}
                tone={
                  goal.status === 'completed'
                    ? 'success'
                    : goal.status === 'overdue'
                      ? 'danger'
                      : 'primary'
                }
              />
              <div className="sp-goalcard__facts">
                <span>{labelFor(GOAL_CATEGORY_LABELS, goal.category)}</span>
                <span>·</span>
                <span>Deadline {formatDate(goal.deadline)}</span>
                {goal.course_title ? (
                  <>
                    <span>·</span>
                    <span>{goal.course_title}</span>
                  </>
                ) : null}
                {goal.completed_at ? (
                  <>
                    <span>·</span>
                    <span>Completed {formatDate(goal.completed_at)}</span>
                  </>
                ) : null}
              </div>
              <div className="sp-goalcard__foot">
                {MANUAL_CATEGORIES.includes(goal.category) &&
                goal.status !== 'completed' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    iconLeft="plus"
                    onClick={() => {
                      setReporting(goal);
                      setIncrement('1');
                    }}
                  >
                    Log progress
                  </Button>
                ) : null}
                <Button size="sm" iconLeft="edit" onClick={() => openEdit(goal)}>
                  Edit
                </Button>
                {goal.status !== 'completed' ? (
                  <Button size="sm" variant="ghost" onClick={() => togglePause(goal)}>
                    {goal.status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft="trash"
                  onClick={() => setDeleting(goal)}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Card
        title="Achievements"
        subtitle="Awarded by the server from validated activity — never duplicated"
        actions={
          <Button
            size="sm"
            variant="ghost"
            iconLeft="refresh"
            onClick={reloadAchievements}
          >
            Re-check
          </Button>
        }
      >
        {achievementsError ? (
          <ErrorState error={achievementsError} onRetry={reloadAchievements} compact />
        ) : achievementsLoading && !achievements ? (
          <Skeleton variant="text" count={4} />
        ) : (
          <div className="sp-stack">
            <div className="sp-ach__grid">
              {achievements?.earned.map((item) => (
                <div className="sp-ach" key={item.code}>
                  <span className="sp-ach__icon">
                    <Icon name="flame" size={18} />
                  </span>
                  <div className="sp-ach__body">
                    <span className="sp-ach__title">{item.title}</span>
                    <span className="sp-ach__meta">{item.description}</span>
                    <span className="sp-ach__meta">
                      Earned {item.earned_at ? formatDate(item.earned_at) : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {achievements?.available.length ? (
              <>
                <p className="sp-section-title" style={{ fontSize: 'var(--fs-md)' }}>
                  Locked
                </p>
                <div className="sp-ach__grid">
                  {achievements.available.map((item) => (
                    <div className="sp-ach sp-ach--locked" key={item.code}>
                      <span className="sp-ach__icon">
                        <Icon name="shield" size={18} />
                      </span>
                      <div className="sp-ach__body">
                        <span className="sp-ach__title">{item.title}</span>
                        <span className="sp-ach__meta">{item.description}</span>
                        <ProgressBar
                          value={item.progress_percent}
                          size="sm"
                          label={`${item.title} progress`}
                        />
                        <span className="sp-ach__meta">
                          {formatNumber(item.current_value)} of{' '}
                          {formatNumber(item.threshold)} ·{' '}
                          {formatPercent(item.progress_percent)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {!achievements?.earned.length && !achievements?.available.length ? (
              <EmptyState
                icon="flame"
                title="No achievements configured"
                description="An administrator still has to define the achievement catalogue."
                compact
              />
            ) : null}
          </div>
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Edit goal' : 'New goal'}
        description="Progress is recomputed by the server; you only set the target."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="sp-goal-form" loading={saving}>
              {editing ? 'Save goal' : 'Create goal'}
            </Button>
          </>
        }
      >
        <form id="sp-goal-form" className="sp-stack" onSubmit={save} noValidate>
          <Input
            label="Title"
            required
            value={form.title}
            error={fieldErrors.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Complete 40 topics this month"
          />
          <Textarea
            label="Description"
            rows={2}
            value={form.description}
            error={fieldErrors.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />
          {!editing ? (
            <Select
              label="Goal type"
              required
              options={GOAL_CATEGORY_OPTIONS}
              value={form.category}
              error={fieldErrors.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
              hint="Determines which stored activity the server counts"
            />
          ) : null}
          {!editing && form.category === 'course_completion' ? (
            <Select
              label="Course"
              required
              placeholder="Select a course"
              options={courses}
              value={form.course_id}
              error={fieldErrors.course_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, course_id: event.target.value }))
              }
            />
          ) : null}
          <div className="sp-grid sp-grid--2">
            <Input
              type="number"
              label="Target value"
              required
              min={0.1}
              step="0.1"
              value={form.target_value}
              error={fieldErrors.target_value}
              onChange={(event) =>
                setForm((current) => ({ ...current, target_value: event.target.value }))
              }
            />
            <Select
              label="Unit"
              placeholder="No unit"
              options={UNIT_OPTIONS}
              value={form.unit}
              error={fieldErrors.unit}
              onChange={(event) =>
                setForm((current) => ({ ...current, unit: event.target.value }))
              }
            />
          </div>
          <div className="sp-grid sp-grid--2">
            <DateInput
              label="Start date"
              value={form.start_date}
              error={fieldErrors.start_date}
              onChange={(event) =>
                setForm((current) => ({ ...current, start_date: event.target.value }))
              }
            />
            <DateInput
              label="Deadline"
              required
              value={form.deadline}
              error={fieldErrors.deadline}
              onChange={(event) =>
                setForm((current) => ({ ...current, deadline: event.target.value }))
              }
            />
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(reporting)}
        tone="primary"
        title="Log practice progress"
        message={
          reporting
            ? `Add to "${reporting.title}". This is the only goal type the server cannot derive from stored activity.`
            : ''
        }
        details={
          <Input
            type="number"
            label="Questions completed"
            min={1}
            max={1000}
            value={increment}
            onChange={(event) => setIncrement(event.target.value)}
          />
        }
        confirmLabel="Record"
        loading={saving}
        onConfirm={reportProgress}
        onClose={() => setReporting(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this goal?"
        message={
          deleting ? `"${deleting.title}" will be removed permanently.` : ''
        }
        confirmLabel="Delete goal"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
