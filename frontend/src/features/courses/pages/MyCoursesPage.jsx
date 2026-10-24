import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
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
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate, relativeFromNow, toDateInput } from '../../../utils/date';
import { formatMinutes, formatPercent } from '../../../utils/format';
import {
  COURSE_CATEGORY_LABELS,
  DIFFICULTY_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import './courses.css';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: '', label: 'All' },
];

/** My Courses — `GET /api/v1/student/enrollments` with per-course progress. */
export default function MyCoursesPage() {
  const toast = useToast();
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    target_completion_date: '',
    priority: 'medium',
    difficulty: 'medium',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [leaving, setLeaving] = useState(null);
  const [leavingBusy, setLeavingBusy] = useState(false);

  const fetchEnrollments = useCallback(
    () => studentApi.listEnrollments({ status }),
    [status],
  );
  const { data, error, loading, reload } = useApi(fetchEnrollments);

  const items = data?.items || [];
  const totalTopics = items.reduce(
    (sum, item) => sum + (item.progress?.total_topics || 0),
    0,
  );
  const completedTopics = items.reduce(
    (sum, item) => sum + (item.progress?.completed_topics || 0),
    0,
  );
  const timeSpent = items.reduce(
    (sum, item) => sum + (item.progress?.time_spent_minutes || 0),
    0,
  );

  function openEdit(enrollment) {
    setEditing(enrollment);
    setForm({
      target_completion_date: toDateInput(enrollment.target_completion_date),
      priority: enrollment.priority || 'medium',
      difficulty: enrollment.difficulty || 'medium',
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await studentApi.updateEnrollment(editing.id, {
        target_completion_date: form.target_completion_date || null,
        priority: form.priority,
        difficulty: form.difficulty,
      });
      toast.success('Course updated');
      setEditing(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not update the course');
    } finally {
      setSavingEdit(false);
    }
  }

  async function markCompleted(enrollment) {
    try {
      await studentApi.updateEnrollment(enrollment.id, { status: 'completed' });
      toast.success('Course marked completed');
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not update the course');
    }
  }

  async function confirmLeave() {
    if (!leaving) return;
    setLeavingBusy(true);
    try {
      await studentApi.removeEnrollment(leaving.id);
      toast.success('Removed from your study list', 'Your topic progress is kept.');
      setLeaving(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not remove the course');
    } finally {
      setLeavingBusy(false);
    }
  }

  if (loading && !data) return <PageLoader tiles={3} cards={2} />;

  return (
    <div className="sp-page">
      <PageHeader
        title="My Courses"
        description="Courses on your study list, with syllabus progress and target dates."
        actions={
          <Button variant="primary" iconLeft="search" to="/app/courses/browse">
            Browse courses
          </Button>
        }
      />

      <div className="sp-grid sp-grid--3">
        <MetricTile label="Enrolled courses" value={items.length} icon="courses" />
        <MetricTile
          label="Topics completed"
          value={`${completedTopics} / ${totalTopics}`}
          sub={formatPercent(totalTopics ? (completedTopics / totalTopics) * 100 : 0)}
          icon="syllabus"
        />
        <MetricTile
          label="Time recorded"
          value={formatMinutes(timeSpent)}
          icon="timer"
        />
      </div>

      <Tabs
        items={TABS}
        active={status}
        onChange={setStatus}
        ariaLabel="Enrollment status"
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} boxed />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="courses"
            title={
              status === 'completed'
                ? 'No completed courses yet'
                : 'You are not enrolled in any course'
            }
            description="Enroll in a published course to get its syllabus, progress tracking and a planner that knows your deadlines."
            action={
              <Button variant="primary" to="/app/courses/browse" iconLeft="plus">
                Browse courses
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="sp-courses__grid">
          {items.map((enrollment) => {
            const course = enrollment.course || {};
            const progress = enrollment.progress || {};
            return (
              <article className="sp-coursecard" key={enrollment.id}>
                <div className="sp-coursecard__head">
                  <Link className="sp-coursecard__title" to={`/app/courses/${course.id}`}>
                    {course.title}
                  </Link>
                  <Badge tone={statusTone(enrollment.status)} size="sm">
                    {labelFor({}, enrollment.status)}
                  </Badge>
                </div>
                <div className="sp-coursecard__facts">
                  <span className="sp-coursecard__fact">
                    <Icon name="layers" size={13} />
                    {labelFor(COURSE_CATEGORY_LABELS, course.category)}
                  </span>
                  <span className="sp-coursecard__fact">
                    <Icon name="target" size={13} />
                    {labelFor(PRIORITY_LABELS, enrollment.priority)} priority
                  </span>
                  {course.level ? (
                    <span className="sp-coursecard__fact">
                      <Icon name="shield" size={13} />
                      {course.level}
                    </span>
                  ) : null}
                </div>
                <ProgressBar
                  value={progress.completion_percent || 0}
                  showLabel
                  label={`${progress.completed_topics || 0} of ${
                    progress.total_topics || 0
                  } topics`}
                  tone={progress.completion_percent >= 100 ? 'success' : 'primary'}
                />
                <div className="sp-coursecard__facts">
                  <span className="sp-coursecard__fact">
                    <Icon name="calendar" size={13} />
                    {enrollment.target_completion_date
                      ? `Target ${formatDate(enrollment.target_completion_date)}`
                      : 'No target date'}
                  </span>
                  <span className="sp-coursecard__fact">
                    <Icon name="timer" size={13} />
                    {formatMinutes(progress.time_spent_minutes)} recorded
                  </span>
                  {enrollment.last_accessed_at ? (
                    <span className="sp-coursecard__fact">
                      <Icon name="refresh" size={13} />
                      {relativeFromNow(enrollment.last_accessed_at)}
                    </span>
                  ) : null}
                </div>
                <div className="sp-coursecard__foot">
                  <Button
                    size="sm"
                    variant="primary"
                    to={`/app/syllabus/${course.id}`}
                    iconLeft="syllabus"
                  >
                    Syllabus
                  </Button>
                  <Button size="sm" onClick={() => openEdit(enrollment)} iconLeft="edit">
                    Settings
                  </Button>
                  {enrollment.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft="check"
                      onClick={() => markCompleted(enrollment)}
                    >
                      Mark done
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft="trash"
                    onClick={() => setLeaving(enrollment)}
                  >
                    Remove
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Course settings"
        description="Target date, priority and difficulty feed the smart timetable generator."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="sp-enrollment-form"
              loading={savingEdit}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="sp-enrollment-form" className="sp-stack" onSubmit={saveEdit} noValidate>
          <DateInput
            label="Target completion date"
            value={form.target_completion_date}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                target_completion_date: event.target.value,
              }))
            }
            hint="Used as the deadline when generating a plan"
          />
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={form.priority}
            onChange={(event) =>
              setForm((current) => ({ ...current, priority: event.target.value }))
            }
          />
          <Select
            label="Difficulty"
            options={DIFFICULTY_OPTIONS}
            value={form.difficulty}
            onChange={(event) =>
              setForm((current) => ({ ...current, difficulty: event.target.value }))
            }
          />
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(leaving)}
        title="Remove this course?"
        message={
          leaving
            ? `"${leaving.course?.title}" will be removed from your study list. Your recorded topic progress is kept, so re-enrolling restores it.`
            : ''
        }
        confirmLabel="Remove course"
        loading={leavingBusy}
        onConfirm={confirmLeave}
        onClose={() => setLeaving(null)}
      />
    </div>
  );
}
