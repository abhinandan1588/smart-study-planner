import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import BarChartCard from '../../../components/charts/BarChartCard';
import ProgressListCard from '../../../components/charts/ProgressListCard';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import MetricTile from '../../../components/ui/MetricTile';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatMinutes, formatNumber } from '../../../utils/format';
import {
  ACCOUNT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import '../admin.css';

/**
 * Student profile (PRD 4.3) — `GET /api/v1/admin/students/:id`.
 *
 * Shows the account, its enrollments, aggregate progress and 30-day study
 * activity. Private topic notes, private uploads and AI conversations are not
 * part of the response and are therefore not rendered anywhere here.
 */
export default function StudentDetailPage() {
  const { studentId } = useParams();
  const toast = useToast();
  const [statusChange, setStatusChange] = useState(null);
  const [reason, setReason] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchStudent = useCallback(
    () => adminApi.students.get(studentId),
    [studentId],
  );
  const { data, error, loading, reload, setData } = useApi(fetchStudent);

  async function applyStatus() {
    if (!statusChange) return;
    const previous = data.student.status;
    setBusy(true);
    setData((current) =>
      current
        ? { ...current, student: { ...current.student, status: statusChange } }
        : current,
    );
    try {
      const result = await adminApi.students.setStatus(
        studentId,
        statusChange,
        reason.trim() || undefined,
      );
      setData((current) =>
        current
          ? {
              ...current,
              student: { ...current.student, ...(result.student || {}) },
              account: { ...current.account, status: result.student?.status },
            }
          : current,
      );
      toast.success('Account status updated', result.message);
      setStatusChange(null);
      setReason('');
    } catch (caught) {
      setData((current) =>
        current
          ? { ...current, student: { ...current.student, status: previous } }
          : current,
      );
      toast.apiError(caught, 'Could not change the account status');
    } finally {
      setBusy(false);
    }
  }

  async function issueReset() {
    setBusy(true);
    try {
      const result = await adminApi.students.issuePasswordReset(studentId);
      toast.success('Recovery token issued', result.message);
      setResetOpen(false);
    } catch (caught) {
      toast.apiError(caught, 'Could not issue a recovery token');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="sp-page">
        <PageHeader title="Student" />
        <ErrorState
          error={error}
          onRetry={reload}
          boxed
          action={
            <Button variant="secondary" to="/admin/students">
              Back to directory
            </Button>
          }
        />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Student" description="Loading profile…" />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (!data) return null;

  const { student, account, activity, progress, enrollments } = data;
  const suspended = student.status === 'suspended';

  const taskSeries = Object.entries(activity.tasks_by_status || {}).map(
    ([key, value]) => ({
      name: labelFor(TASK_STATUS_LABELS, key),
      count: value,
    }),
  );

  return (
    <div className="sp-page">
      <PageHeader
        title={student.full_name}
        description={`${student.email} · account #${student.id}`}
        actions={
          <>
            <Button variant="secondary" to="/admin/students">
              Back
            </Button>
            <Button variant="secondary" onClick={() => setResetOpen(true)}>
              Password recovery
            </Button>
            {suspended ? (
              <Button
                variant="primary"
                iconLeft="check"
                onClick={() => {
                  setReason('');
                  setStatusChange('active');
                }}
              >
                Activate
              </Button>
            ) : (
              <Button
                variant="danger"
                iconLeft="shield"
                onClick={() => {
                  setReason('');
                  setStatusChange('suspended');
                }}
              >
                Suspend
              </Button>
            )}
          </>
        }
      >
        <div className="sp-adm__chips" style={{ marginTop: 'var(--sp-2)' }}>
          <Badge tone={statusTone(student.status)} dot>
            {labelFor(ACCOUNT_STATUS_LABELS, student.status)}
          </Badge>
          <Badge tone={account.email_verified ? 'success' : 'warning'}>
            {account.email_verified ? 'Email verified' : 'Email unverified'}
          </Badge>
          <Badge tone="neutral">{account.timezone || 'UTC'}</Badge>
        </div>
      </PageHeader>

      <div className="sp-adm__metrics">
        <MetricTile
          label="Syllabus completion"
          value={`${progress?.completion_percent ?? 0}%`}
          sub={`${formatNumber(progress?.completed_topics)} of ${formatNumber(
            progress?.total_topics,
          )} topics`}
          icon="syllabus"
        />
        <MetricTile
          label={`Studied (${activity.window_days}d)`}
          value={formatMinutes(activity.studied_minutes)}
          sub={`${formatMinutes(activity.planned_minutes)} planned`}
          icon="calendar"
        />
        <MetricTile
          label={`Focus time (${activity.window_days}d)`}
          value={formatMinutes(activity.focus_minutes)}
          sub={`${formatNumber(activity.focus_sessions)} sessions`}
          icon="timer"
        />
        <MetricTile
          label="Active goals"
          value={formatNumber(activity.active_goals)}
          sub={`${formatNumber(activity.unread_notifications)} unread notices`}
          icon="target"
        />
      </div>

      <Card title="Account">
        <dl className="sp-adm__dl">
          <div>
            <span className="sp-adm__dt">Registered</span>
            <dd className="sp-adm__dd">{formatDateTime(account.created_at)}</dd>
          </div>
          <div>
            <span className="sp-adm__dt">Last login</span>
            <dd className="sp-adm__dd">
              {account.last_login_at ? formatDateTime(account.last_login_at) : 'Never'}
            </dd>
          </div>
          <div>
            <span className="sp-adm__dt">Daily study target</span>
            <dd className="sp-adm__dd">
              {formatMinutes(account.daily_target_minutes)}
            </dd>
          </div>
          <div>
            <span className="sp-adm__dt">Enrollments</span>
            <dd className="sp-adm__dd">{formatNumber(student.enrollment_count)}</dd>
          </div>
          <div>
            <span className="sp-adm__dt">Private uploads</span>
            <dd className="sp-adm__dd">
              {formatNumber(activity.private_uploads)} (not readable here)
            </dd>
          </div>
          <div>
            <span className="sp-adm__dt">Time on topics</span>
            <dd className="sp-adm__dd">
              {formatMinutes(progress?.time_spent_minutes)}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="sp-adm__split">
        <ProgressListCard
          title="Course progress"
          subtitle="Completion per enrolled course"
          items={(enrollments || []).map((enrollment) => ({
            id: enrollment.id,
            label: enrollment.course_title || `Course ${enrollment.course_id}`,
            percent: enrollment.progress_percent || 0,
            meta: `${enrollment.progress?.completed_topics ?? 0}/${
              enrollment.progress?.total_topics ?? 0
            } topics`,
          }))}
          emptyTitle="No enrollments"
          emptyDescription="This student has not enrolled in a course yet."
        />

        <BarChartCard
          title="Tasks by status"
          subtitle="All tasks on this account"
          data={taskSeries}
          series={[{ key: 'count', name: 'Tasks' }]}
          xKey="name"
          height={220}
          emptyTitle="No tasks created"
          emptyDescription="Tasks the student creates are counted here."
        />
      </div>

      <Card title="Enrollments" subtitle="Targets, priority and progress">
        {enrollments?.length ? (
          <ul className="sp-adm__list">
            {enrollments.map((enrollment) => (
              <li key={enrollment.id}>
                <span className="sp-adm__primary">
                  <span className="sp-adm__itemtitle">{enrollment.course_title}</span>
                  <span className="sp-adm__itemmeta">
                    Enrolled {formatDate(enrollment.enrolled_at)} · priority{' '}
                    {enrollment.priority} · difficulty {enrollment.difficulty}
                    {enrollment.target_completion_date
                      ? ` · target ${formatDate(enrollment.target_completion_date)}`
                      : ''}
                  </span>
                </span>
                <span className="sp-adm__chips">
                  <Badge tone={statusTone(enrollment.status)} size="sm">
                    {enrollment.status}
                  </Badge>
                  <Badge tone="neutral" size="sm">
                    {enrollment.progress_percent ?? 0}%
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="courses"
            title="No enrollments"
            description="This student has not enrolled in a course yet."
            compact
          />
        )}
      </Card>

      <p className="sp-adm__note">
        <strong>Privacy:</strong> {data.privacy_note}
      </p>

      <ConfirmDialog
        open={Boolean(statusChange)}
        title={
          statusChange === 'suspended' ? 'Suspend this account?' : 'Activate this account?'
        }
        message={
          statusChange === 'suspended'
            ? `${student.full_name} will be blocked from signing in until the account is activated again. Study records are preserved.`
            : `${student.full_name} will be able to sign in again, and the email address will be marked verified.`
        }
        details={
          <Textarea
            label="Reason (recorded in the audit log)"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        }
        confirmLabel={statusChange === 'suspended' ? 'Suspend account' : 'Activate account'}
        tone={statusChange === 'suspended' ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={applyStatus}
        onClose={() => {
          setStatusChange(null);
          setReason('');
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Issue a password recovery token?"
        message={`A one-hour recovery token will be issued for ${student.email}. Administrators never see or set a password.`}
        confirmLabel="Issue token"
        tone="primary"
        loading={busy}
        onConfirm={issueReset}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
