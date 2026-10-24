import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DateInput from '../../../components/ui/DateInput';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { coursesApi } from '../../../services/coursesApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate } from '../../../utils/date';
import { formatMinutes, formatNumber, formatPercent } from '../../../utils/format';
import {
  COURSE_CATEGORY_LABELS,
  PRIORITY_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import './courses.css';

/** Course detail — `GET /api/v1/courses/:id` plus enroll / unenroll. */
export default function CourseDetailPage() {
  const { courseId } = useParams();
  const toast = useToast();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ target_completion_date: '', priority: 'medium' });

  const fetchCourse = useCallback(() => coursesApi.get(courseId), [courseId]);
  const { data, error, loading, reload } = useApi(fetchCourse);

  async function enroll() {
    setBusy(true);
    try {
      await studentApi.enroll({
        course_id: Number(courseId),
        target_completion_date: form.target_completion_date || null,
        priority: form.priority,
      });
      toast.success('Enrolled', 'The syllabus is now on your study list.');
      setEnrollOpen(false);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not enroll');
    } finally {
      setBusy(false);
    }
  }

  async function unenroll() {
    setBusy(true);
    try {
      const enrollments = await studentApi.listEnrollments();
      const match = (enrollments.items || []).find(
        (item) => item.course_id === Number(courseId),
      );
      if (!match) throw new Error('not enrolled');
      await studentApi.removeEnrollment(match.id);
      toast.success('Removed from your study list', 'Your topic progress is kept.');
      setLeaveOpen(false);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not remove the course');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PageLoader tiles={3} cards={2} />;
  if (error && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Course" />
        <ErrorState error={error} onRetry={reload} boxed />
      </div>
    );
  }

  const course = data?.course;
  if (!course) return null;
  const progress = course.progress;

  return (
    <div className="sp-page">
      <PageHeader
        title={course.title}
        description={course.description}
        actions={
          course.is_enrolled ? (
            <>
              <Button variant="primary" to={`/app/syllabus/${course.id}`} iconLeft="syllabus">
                Open syllabus
              </Button>
              <Button iconLeft="trash" onClick={() => setLeaveOpen(true)}>
                Remove
              </Button>
            </>
          ) : (
            <Button variant="primary" iconLeft="plus" onClick={() => setEnrollOpen(true)}>
              Enroll in this course
            </Button>
          )
        }
      >
        <div className="sp-row sp-row--wrap" style={{ marginTop: 'var(--sp-2)' }}>
          <Badge tone={statusTone(course.category)}>
            {labelFor(COURSE_CATEGORY_LABELS, course.category)}
          </Badge>
          {course.level ? <Badge>{course.level}</Badge> : null}
          {course.is_enrolled ? <Badge tone="success">Enrolled</Badge> : null}
        </div>
      </PageHeader>

      <div className="sp-grid sp-grid--4">
        <MetricTile
          label="Subjects"
          value={formatNumber(course.subject_count)}
          icon="layers"
        />
        <MetricTile
          label="Topics"
          value={formatNumber(course.topic_count)}
          icon="syllabus"
        />
        <MetricTile
          label="Duration"
          value={
            course.estimated_duration_weeks
              ? `${course.estimated_duration_weeks} weeks`
              : '—'
          }
          icon="calendar"
        />
        <MetricTile
          label="Enrolled students"
          value={formatNumber(course.enrolled_students)}
          icon="users"
        />
      </div>

      <div className="sp-coursedetail">
        <div className="sp-coursedetail__col">
          <Card
            title="Subjects in this syllabus"
            subtitle={
              course.syllabus_version
                ? `Published version ${course.syllabus_version.version_number}`
                : 'No syllabus published yet'
            }
          >
            {course.subjects?.length ? (
              <ul>
                {course.subjects.map((subject) => (
                  <li className="sp-subjectrow" key={subject.id}>
                    <div>
                      <p className="sp-task__name">{subject.name}</p>
                      {subject.description ? (
                        <p className="sp-task__sub">{subject.description}</p>
                      ) : null}
                    </div>
                    <span className="sp-progresslist__meta">
                      {formatNumber(subject.topic_count)} topics
                      {subject.course_weightage
                        ? ` · weight ${subject.course_weightage}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="layers"
                title="No subjects linked yet"
                description="An administrator still has to attach subjects and publish a syllabus version."
                compact
              />
            )}
          </Card>

          {course.target_audience ? (
            <Card title="Who this is for">
              <p className="sp-muted">{course.target_audience}</p>
            </Card>
          ) : null}
        </div>

        <div className="sp-coursedetail__col">
          {course.is_enrolled && progress ? (
            <Card title="Your progress" subtitle="Computed from your own topic records">
              <ProgressBar
                value={progress.completion_percent || 0}
                showLabel
                label="Topics completed"
                tone={progress.completion_percent >= 100 ? 'success' : 'primary'}
              />
              <dl className="sp-deflist" style={{ marginTop: 'var(--sp-4)' }}>
                <dt>Completed</dt>
                <dd>
                  {progress.completed_topics} / {progress.total_topics}
                </dd>
                <dt>In progress</dt>
                <dd>{progress.in_progress_topics}</dd>
                <dt>Weighted</dt>
                <dd>{formatPercent(progress.weighted_completion_percent)}</dd>
                <dt>Time recorded</dt>
                <dd>{formatMinutes(progress.time_spent_minutes)}</dd>
                <dt>Estimated total</dt>
                <dd>{formatMinutes(progress.estimated_minutes)}</dd>
              </dl>
            </Card>
          ) : null}

          <Card title="Course details">
            <dl className="sp-deflist">
              <dt>Status</dt>
              <dd>{labelFor({}, course.status)}</dd>
              <dt>Category</dt>
              <dd>{labelFor(COURSE_CATEGORY_LABELS, course.category)}</dd>
              {course.syllabus_version?.published_at ? (
                <>
                  <dt>Syllabus published</dt>
                  <dd>{formatDate(course.syllabus_version.published_at)}</dd>
                </>
              ) : null}
              <dt>Added</dt>
              <dd>{formatDate(course.created_at)}</dd>
              <dt>Last updated</dt>
              <dd>{formatDate(course.updated_at)}</dd>
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={enrollOpen}
        tone="primary"
        title="Enroll in this course?"
        message={`"${course.title}" will be added to your study list with its full syllabus.`}
        details={
          <div className="sp-stack">
            <DateInput
              label="Target completion date"
              value={form.target_completion_date}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  target_completion_date: event.target.value,
                }))
              }
            />
            <Select
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({ ...current, priority: event.target.value }))
              }
            />
          </div>
        }
        confirmLabel="Enroll"
        loading={busy}
        onConfirm={enroll}
        onClose={() => setEnrollOpen(false)}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="Remove this course?"
        message={`"${course.title}" leaves your study list. Recorded topic progress is kept, so re-enrolling restores it.`}
        confirmLabel="Remove course"
        loading={busy}
        onConfirm={unenroll}
        onClose={() => setLeaveOpen(false)}
      />
    </div>
  );
}
