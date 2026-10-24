import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import BarChartCard from '../../../components/charts/BarChartCard';
import LineChartCard from '../../../components/charts/LineChartCard';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import MetricTile from '../../../components/ui/MetricTile';
import Skeleton, { SkeletonCard } from '../../../components/ui/Skeleton';
import useApi from '../../../hooks/useApi';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatBytes, formatMinutes, formatNumber } from '../../../utils/format';
import { ACCOUNT_STATUS_LABELS, labelFor, statusTone } from '../../../utils/constants';
import DateRangeFilter, { rangeForDays } from '../components/DateRangeFilter';
import '../admin.css';

/**
 * Admin dashboard (PRD 4.2) — `GET /api/v1/admin/dashboard?from=&to=`.
 *
 * Every figure, series and list on this page is an aggregate the backend
 * computed from stored rows; the page only formats and charts them.
 */
export default function AdminDashboardPage() {
  const [range, setRange] = useState(() => rangeForDays(30));

  const fetchDashboard = useCallback(
    () => adminApi.dashboard({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const { data, error, loading, reload } = useApi(fetchDashboard);

  const totals = data?.totals;

  const activity = useMemo(
    () =>
      (data?.activity || []).map((row) => ({
        date: row.date,
        sessions: row.sessions,
        focus_minutes: row.focus_minutes,
        session_minutes: row.session_minutes,
        topics_completed: row.topics_completed,
        active_students: row.active_students,
      })),
    [data],
  );

  const signups = useMemo(
    () =>
      (data?.signups || []).map((row) => ({
        date: row.date,
        registrations: row.registrations,
      })),
    [data],
  );

  const distribution = useMemo(
    () =>
      (data?.enrollment_distribution || [])
        .slice(0, 8)
        .map((row) => ({ name: row.course, count: row.count })),
    [data],
  );

  const shortDate = (value) => formatDate(value, { year: undefined });

  if (error) {
    return (
      <div className="sp-page">
        <PageHeader
          title="Dashboard"
          description="Platform statistics for the selected period."
        />
        <ErrorState error={error} onRetry={reload} boxed />
      </div>
    );
  }

  return (
    <div className="sp-page">
      <PageHeader
        title="Dashboard"
        description={
          data?.range
            ? `Platform activity from ${formatDate(data.range.from)} to ${formatDate(
                data.range.to,
              )} (${data.range.days} days).`
            : 'Platform statistics, enrollment distribution and recent administrative actions.'
        }
        actions={
          <Button variant="secondary" iconLeft="refresh" onClick={reload} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card title="Reporting period">
        <DateRangeFilter value={range} onChange={setRange} disabled={loading} />
      </Card>

      {loading && !data ? (
        <>
          <div className="sp-adm__metrics">
            {Array.from({ length: 8 }).map((_, index) => (
              <Card key={index}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="35%" />
              </Card>
            ))}
          </div>
          <div className="sp-adm__split--even sp-adm__split">
            <SkeletonCard lines={6} />
            <SkeletonCard lines={6} />
          </div>
        </>
      ) : null}

      {totals ? (
        <>
          <div className="sp-adm__metrics">
            <MetricTile
              label="Registered students"
              value={formatNumber(totals.total_students)}
              sub={`${formatNumber(totals.students_by_status.active)} active · ${formatNumber(
                totals.students_by_status.suspended,
              )} suspended`}
              icon="users"
            />
            <MetricTile
              label="Active in period"
              value={formatNumber(totals.active_students)}
              sub="Studied, focused or updated progress"
              icon="flame"
              tone="success"
            />
            <MetricTile
              label="New registrations"
              value={formatNumber(totals.new_registrations)}
              sub={`${formatNumber(
                totals.students_by_status.pending_verification,
              )} awaiting verification`}
              icon="plus"
            />
            <MetricTile
              label="Published courses"
              value={formatNumber(totals.published_courses)}
              sub={`${formatNumber(totals.draft_courses)} draft · ${formatNumber(
                totals.archived_courses,
              )} archived`}
              icon="courses"
            />
            <MetricTile
              label="Subjects"
              value={formatNumber(totals.subject_count)}
              sub={`${formatNumber(totals.unit_count)} units`}
              icon="layers"
            />
            <MetricTile
              label="Published topics"
              value={formatNumber(totals.topic_count)}
              sub="Across published syllabus versions"
              icon="syllabus"
            />
            <MetricTile
              label="Study materials"
              value={formatNumber(totals.resource_count)}
              sub={`${formatNumber(totals.published_resources)} published`}
              icon="folder"
            />
            <MetricTile
              label="Enrollments"
              value={formatNumber(totals.total_enrollments)}
              sub={`${formatNumber(totals.active_enrollments)} active`}
              icon="check"
            />
          </div>

          {data.warnings?.length ? (
            <Card
              title="Operational warnings"
              subtitle="Conditions an administrator should resolve"
            >
              <ul className="sp-adm__warnings">
                {data.warnings.map((warning) => (
                  <li
                    key={warning.code}
                    className={`sp-adm__warning ${
                      warning.severity === 'info' ? 'sp-adm__warning--info' : ''
                    }`}
                  >
                    <Icon name={warning.severity === 'info' ? 'info' : 'warning'} size={16} />
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="sp-adm__split">
            <LineChartCard
              title="Daily platform activity"
              subtitle="Planned sessions and focus minutes per day"
              data={activity}
              series={[
                { key: 'sessions', name: 'Study sessions' },
                { key: 'focus_minutes', name: 'Focus minutes' },
              ]}
              xKey="date"
              height={260}
              formatLabel={shortDate}
              emptyTitle="No activity in this period"
              emptyDescription="Pick a wider date range, or wait for students to record sessions."
            />
            <LineChartCard
              title="Registrations"
              subtitle="New student accounts per day"
              data={signups}
              series={[{ key: 'registrations', name: 'Registrations' }]}
              xKey="date"
              height={260}
              formatLabel={shortDate}
              emptyTitle="No registrations in this period"
              emptyDescription="New accounts appear here on the day they are created."
            />
          </div>

          <div className="sp-adm__split">
            <BarChartCard
              title="Enrollment distribution"
              subtitle="Students enrolled per course"
              data={distribution}
              series={[{ key: 'count', name: 'Enrollments' }]}
              xKey="name"
              layout="vertical"
              height={Math.max(200, distribution.length * 34)}
              emptyTitle="No enrollments yet"
              emptyDescription="Publish a course so students can enrol in it."
              actions={
                <Button size="sm" variant="ghost" to="/admin/courses">
                  Courses
                </Button>
              }
            />

            <Card
              title="Popular courses"
              subtitle="Highest enrollment counts"
              actions={
                <Button size="sm" variant="ghost" to="/admin/reports">
                  Reports
                </Button>
              }
            >
              {data.popular_courses?.length ? (
                <ul className="sp-adm__list">
                  {data.popular_courses.map((course) => (
                    <li key={course.course_id}>
                      <span className="sp-adm__primary">
                        <Link
                          to={`/admin/courses/${course.course_id}`}
                          className="sp-adm__itemtitle"
                        >
                          {course.course}
                        </Link>
                        <span className="sp-adm__itemmeta">
                          {formatNumber(course.count)} enrolled
                        </span>
                      </span>
                      <Badge tone={statusTone(course.status)} size="sm">
                        {course.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="courses"
                  title="No course has enrollments yet"
                  description="Publish a course to make it visible to students."
                  compact
                  action={
                    <Button size="sm" variant="primary" to="/admin/courses">
                      Manage courses
                    </Button>
                  }
                />
              )}
            </Card>
          </div>

          <div className="sp-adm__split">
            <Card
              title="Recent registrations"
              subtitle="Newest student accounts"
              actions={
                <Button size="sm" variant="ghost" to="/admin/students">
                  All students
                </Button>
              }
            >
              {data.recent_registrations?.length ? (
                <ul className="sp-adm__list">
                  {data.recent_registrations.map((student) => (
                    <li key={student.id}>
                      <span className="sp-adm__primary">
                        <Link
                          to={`/admin/students/${student.id}`}
                          className="sp-adm__itemtitle"
                        >
                          {student.full_name}
                        </Link>
                        <span className="sp-adm__itemmeta">
                          {student.email} · joined {formatDate(student.created_at)}
                        </span>
                      </span>
                      <Badge tone={statusTone(student.status)} size="sm">
                        {labelFor(ACCOUNT_STATUS_LABELS, student.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="users"
                  title="No student accounts yet"
                  description="Registrations appear here as soon as students sign up."
                  compact
                />
              )}
            </Card>

            <Card
              title="Recent administrative actions"
              subtitle="From the audit log"
              actions={
                <Button size="sm" variant="ghost" to="/admin/audit-logs">
                  Audit log
                </Button>
              }
            >
              {data.recent_admin_actions?.length ? (
                <ul className="sp-adm__list">
                  {data.recent_admin_actions.map((entry) => (
                    <li key={entry.id}>
                      <span className="sp-adm__primary">
                        <span className="sp-adm__itemtitle">{entry.action}</span>
                        <span className="sp-adm__itemmeta">
                          {entry.actor_email || 'System'} ·{' '}
                          {formatDateTime(entry.created_at)}
                        </span>
                      </span>
                      {entry.entity_type ? (
                        <span className="sp-adm__mono">
                          {entry.entity_type}
                          {entry.entity_id ? `#${entry.entity_id}` : ''}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="shield"
                  title="No administrative actions recorded"
                  description="Status changes, publications and deletions are audited automatically."
                  compact
                />
              )}
            </Card>
          </div>

          <Card title="Platform snapshot" subtitle="Content and storage counters">
            <dl className="sp-adm__dl">
              <div>
                <span className="sp-adm__dt">Published announcements</span>
                <dd className="sp-adm__dd">
                  {formatNumber(totals.published_announcements)}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Studied minutes in period</span>
                <dd className="sp-adm__dd">
                  {formatMinutes(
                    activity.reduce((sum, row) => sum + (row.session_minutes || 0), 0),
                  )}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Focus minutes in period</span>
                <dd className="sp-adm__dd">
                  {formatMinutes(
                    activity.reduce((sum, row) => sum + (row.focus_minutes || 0), 0),
                  )}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Topics completed in period</span>
                <dd className="sp-adm__dd">
                  {formatNumber(
                    activity.reduce((sum, row) => sum + (row.topics_completed || 0), 0),
                  )}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Uploaded files</span>
                <dd className="sp-adm__dd">
                  {formatNumber(data.storage?.file_count || 0)}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Storage used</span>
                <dd className="sp-adm__dd">
                  {formatBytes(data.storage?.total_bytes || 0)}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Generated</span>
                <dd className="sp-adm__dd">{formatDateTime(data.generated_at)}</dd>
              </div>
            </dl>
          </Card>
        </>
      ) : null}
    </div>
  );
}
