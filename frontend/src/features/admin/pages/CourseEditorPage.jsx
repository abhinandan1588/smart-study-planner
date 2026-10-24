import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import IconButton from '../../../components/ui/IconButton';
import MetricTile from '../../../components/ui/MetricTile';
import Select from '../../../components/ui/Select';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import Tabs, { TabPanel } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatNumber } from '../../../utils/format';
import {
  COURSE_CATEGORY_LABELS,
  COURSE_STATUS_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import CourseFormDrawer from '../components/CourseFormDrawer';
import '../admin.css';

/**
 * One course (PRD 4.4 / 4.5) — `GET /api/v1/admin/courses/:id` plus the
 * course↔subject link endpoints, the syllabus version list and
 * `GET /admin/courses/:id/enrollments`.
 */
export default function CourseEditorPage() {
  const { courseId } = useParams();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchCourse = useCallback(() => adminApi.courses.get(courseId), [courseId]);
  const { data, error, loading, reload } = useApi(fetchCourse);

  async function runAction() {
    if (!action) return;
    setBusy(true);
    try {
      const result = await action.run();
      toast.success('Course updated', result?.message || undefined);
      if (result?.warning) toast.warning('Check the syllabus', result.warning);
      setAction(null);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'The change was refused');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="sp-page">
        <PageHeader title="Course" />
        <ErrorState
          error={error}
          onRetry={reload}
          boxed
          action={
            <Button variant="secondary" to="/admin/courses">
              Back to courses
            </Button>
          }
        />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Course" description="Loading…" />
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (!data) return null;

  const { course, subjects, syllabus_versions: versions, impact } = data;
  const publishedVersion = versions?.find((version) => version.status === 'published');

  return (
    <div className="sp-page">
      <PageHeader
        title={course.title}
        description={`/${course.slug} · ${labelFor(
          COURSE_CATEGORY_LABELS,
          course.category,
        )}${course.level ? ` · ${course.level}` : ''}`}
        actions={
          <>
            <Button variant="secondary" to="/admin/courses">
              Back
            </Button>
            <Button variant="secondary" iconLeft="edit" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {course.status === 'published' ? (
              <Button
                variant="secondary"
                onClick={() =>
                  setAction({
                    title: 'Move this course back to draft?',
                    message: `"${course.title}" is removed from the student catalogue. ${formatNumber(
                      impact.active_enrollments,
                    )} active enrollment(s) and all topic progress are preserved.`,
                    confirmLabel: 'Unpublish course',
                    tone: 'danger',
                    run: () => adminApi.courses.unpublish(course.id, { confirm: true }),
                  })
                }
              >
                Unpublish
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() =>
                  setAction({
                    title: 'Publish this course?',
                    message: `"${course.title}" becomes visible to eligible students.${
                      publishedVersion
                        ? ''
                        : ' It has no published syllabus version yet.'
                    }`,
                    confirmLabel: 'Publish course',
                    tone: 'primary',
                    run: () => adminApi.courses.publish(course.id),
                  })
                }
              >
                Publish
              </Button>
            )}
            {course.status === 'archived' ? null : (
              <Button
                variant="danger"
                iconLeft="trash"
                onClick={() =>
                  setAction({
                    title: 'Archive this course?',
                    message: `"${course.title}" is archived and no longer offered. ${formatNumber(
                      impact.enrollments,
                    )} enrollment(s) and their historical progress are kept intact.`,
                    confirmLabel: 'Archive course',
                    tone: 'danger',
                    run: () => adminApi.courses.archive(course.id, { confirm: true }),
                  })
                }
              >
                Archive
              </Button>
            )}
          </>
        }
      >
        <div className="sp-adm__chips" style={{ marginTop: 'var(--sp-2)' }}>
          <Badge tone={statusTone(course.status)} dot>
            {labelFor(COURSE_STATUS_LABELS, course.status)}
          </Badge>
          {publishedVersion ? (
            <Badge tone="info">Syllabus v{publishedVersion.version_number}</Badge>
          ) : (
            <Badge tone="warning">No published syllabus</Badge>
          )}
        </div>
      </PageHeader>

      <div className="sp-adm__metrics">
        <MetricTile
          label="Subjects"
          value={formatNumber(course.subject_count)}
          sub="Linked to this course"
          icon="layers"
        />
        <MetricTile
          label="Published topics"
          value={formatNumber(course.topic_count)}
          sub={`${formatNumber(versions?.length || 0)} syllabus version(s)`}
          icon="syllabus"
        />
        <MetricTile
          label="Enrollments"
          value={formatNumber(impact.enrollments)}
          sub={`${formatNumber(impact.active_enrollments)} active`}
          icon="users"
        />
        <MetricTile
          label="Study materials"
          value={formatNumber(data.resource_count)}
          sub="Attached to this course"
          icon="folder"
        />
      </div>

      <Tabs
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'subjects', label: 'Subjects', count: subjects?.length || 0 },
          { key: 'versions', label: 'Syllabus versions', count: versions?.length || 0 },
          { key: 'enrollments', label: 'Enrolled students' },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Course sections"
      />

      <TabPanel tabKey="overview" active={tab}>
        <Card title="Course details">
          <dl className="sp-adm__dl">
            <div>
              <span className="sp-adm__dt">Target audience</span>
              <dd className="sp-adm__dd">{course.target_audience || '—'}</dd>
            </div>
            <div>
              <span className="sp-adm__dt">Estimated duration</span>
              <dd className="sp-adm__dd">
                {course.estimated_duration_weeks
                  ? `${course.estimated_duration_weeks} weeks`
                  : '—'}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Created</span>
              <dd className="sp-adm__dd">
                {formatDateTime(course.created_at)}
                {course.created_by_email ? ` · ${course.created_by_email}` : ''}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Last updated</span>
              <dd className="sp-adm__dd">{formatDateTime(course.updated_at)}</dd>
            </div>
          </dl>
          {course.description ? (
            <p className="sp-adm__previewbody" style={{ marginTop: 'var(--sp-4)' }}>
              {course.description}
            </p>
          ) : (
            <p className="sp-muted" style={{ marginTop: 'var(--sp-4)' }}>
              No description yet.
            </p>
          )}
        </Card>

        <p className="sp-adm__note">
          <strong>Archived courses keep their progress.</strong> Unpublishing or
          archiving only removes a course from the catalogue; enrollments and
          topic progress rows are never deleted.
        </p>
      </TabPanel>

      <TabPanel tabKey="subjects" active={tab}>
        <CourseSubjects courseId={course.id} subjects={subjects || []} onChanged={reload} />
      </TabPanel>

      <TabPanel tabKey="versions" active={tab}>
        <Card
          title="Syllabus versions"
          subtitle="Publishing a draft copies student progress forward and archives the previous version"
          actions={
            <Button
              size="sm"
              variant="primary"
              to={`/admin/syllabus?course_id=${course.id}`}
            >
              Open syllabus editor
            </Button>
          }
        >
          {versions?.length ? (
            <ul className="sp-adm__list">
              {versions.map((version) => (
                <li key={version.id}>
                  <span className="sp-adm__primary">
                    <span className="sp-adm__itemtitle">
                      Version {version.version_number}
                    </span>
                    <span className="sp-adm__itemmeta">
                      {formatNumber(version.unit_count)} units ·{' '}
                      {formatNumber(version.topic_count)} topics · created{' '}
                      {formatDate(version.created_at)}
                      {version.published_at
                        ? ` · published ${formatDate(version.published_at)}`
                        : ''}
                    </span>
                  </span>
                  <span className="sp-adm__chips">
                    <Badge tone={statusTone(version.status)} size="sm">
                      {version.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      to={`/admin/syllabus?course_id=${course.id}&version_id=${version.id}`}
                    >
                      Edit
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="syllabus"
              title="No syllabus version yet"
              description="Create a draft version in the syllabus editor, add units and topics, then publish it."
              compact
              action={
                <Button
                  size="sm"
                  variant="primary"
                  to={`/admin/syllabus?course_id=${course.id}`}
                >
                  Open syllabus editor
                </Button>
              }
            />
          )}
        </Card>
      </TabPanel>

      <TabPanel tabKey="enrollments" active={tab}>
        <CourseEnrollments courseId={course.id} />
      </TabPanel>

      <CourseFormDrawer
        open={editing}
        course={course}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.title}
        message={action?.message}
        confirmLabel={action?.confirmLabel}
        tone={action?.tone}
        loading={busy}
        onConfirm={runAction}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

/* --- subjects linked to the course ------------------------------------- */

function CourseSubjects({ courseId, subjects, onChanged }) {
  const toast = useToast();
  const [available, setAvailable] = useState([]);
  const [pick, setPick] = useState('');
  const [order, setOrder] = useState(subjects);
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState(null);

  useEffect(() => {
    setOrder(subjects);
  }, [subjects]);

  useEffect(() => {
    adminApi.subjects
      .list({ per_page: 100, status: 'active', sort: 'name' })
      .then((payload) =>
        setAvailable(
          (payload.items || []).map((subject) => ({
            value: String(subject.id),
            label: subject.name,
          })),
        ),
      )
      .catch(() => setAvailable([]));
  }, []);

  const linkedIds = new Set(order.map((subject) => String(subject.id)));
  const options = available.filter((option) => !linkedIds.has(option.value));

  async function link() {
    if (!pick) return;
    setBusy(true);
    try {
      await adminApi.courses.linkSubject(courseId, { subject_id: Number(pick) });
      toast.success('Subject linked');
      setPick('');
      onChanged();
    } catch (caught) {
      toast.apiError(caught, 'Could not link the subject');
    } finally {
      setBusy(false);
    }
  }

  async function move(index, delta) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    try {
      await adminApi.courses.reorderSubjects(
        courseId,
        next.map((subject, position) => ({
          subject_id: subject.id,
          display_order: position,
        })),
      );
    } catch (caught) {
      setOrder(subjects); // revert to the server's order
      toast.apiError(caught, 'Could not save the new order');
    }
  }

  async function unlink() {
    if (!unlinking) return;
    setBusy(true);
    try {
      await adminApi.courses.unlinkSubject(courseId, unlinking.id, { confirm: true });
      toast.success('Subject unlinked', 'Syllabus rows and student progress are untouched.');
      setUnlinking(null);
      onChanged();
    } catch (caught) {
      toast.apiError(caught, 'Could not unlink the subject');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="Link a subject" subtitle="Subjects are shared across courses">
        <div className="sp-adm__filters">
          <Select
            label="Subject"
            placeholder={options.length ? 'Choose a subject' : 'No unlinked subjects left'}
            options={options}
            value={pick}
            disabled={options.length === 0}
            onChange={(event) => setPick(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <div className="sp-adm__filteractions">
              <Button variant="primary" disabled={!pick} loading={busy} onClick={link}>
                Link subject
              </Button>
              <Button variant="secondary" to="/admin/subjects">
                Manage subjects
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Linked subjects" subtitle="Order controls the student-facing sequence">
        {order.length ? (
          <ul className="sp-adm__list">
            {order.map((subject, index) => (
              <li key={subject.id}>
                <span className="sp-adm__primary">
                  <Link to="/admin/subjects" className="sp-adm__itemtitle">
                    {subject.name}
                  </Link>
                  <span className="sp-adm__itemmeta">
                    Position {index + 1}
                    {subject.weightage ? ` · weightage ${subject.weightage}` : ''}
                    {subject.status === 'archived' ? ' · archived' : ''}
                  </span>
                </span>
                <span className="sp-adm__rowactions">
                  <IconButton
                    icon="chevronDown"
                    label={`Move ${subject.name} up`}
                    size="sm"
                    variant="outline"
                    className="sp-adm__flip"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  />
                  <IconButton
                    icon="chevronDown"
                    label={`Move ${subject.name} down`}
                    size="sm"
                    variant="outline"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft="trash"
                    onClick={() => setUnlinking(subject)}
                  >
                    Unlink
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="layers"
            title="No subjects linked"
            description="Link at least one subject before building the syllabus."
            compact
          />
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(unlinking)}
        title="Unlink this subject?"
        message={
          unlinking
            ? `"${unlinking.name}" is removed from this course's subject list. Any syllabus units it holds and all student progress are left untouched.`
            : ''
        }
        confirmLabel="Unlink subject"
        loading={busy}
        onConfirm={unlink}
        onClose={() => setUnlinking(null)}
      />
    </>
  );
}

/* --- enrolled students -------------------------------------------------- */

function CourseEnrollments({ courseId }) {
  const pager = usePagination({ perPage: 10 });
  const [status, setStatus] = useState('');

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchEnrollments = useCallback(
    () =>
      adminApi.courses.enrollments(courseId, {
        page: pager.page,
        per_page: pager.perPage,
        status,
      }),
    [courseId, pager.page, pager.perPage, status],
  );
  const { data, error, loading, reload } = useApi(fetchEnrollments, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  return (
    <Card
      title="Enrolled students"
      subtitle="Reviewed before archiving or unpublishing a course"
      actions={
        <Select
          size="sm"
          aria-label="Filter enrollments by status"
          placeholder="Any status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'dropped', label: 'Dropped' },
          ]}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        />
      }
      padded={false}
    >
      <DataTable
        columns={[
          {
            key: 'student_name',
            header: 'Student',
            render: (row) => (
              <div className="sp-adm__primary">
                <Link to={`/admin/students/${row.student_id}`}>
                  <strong>{row.student_name}</strong>
                </Link>
                <span className="sp-adm__sub">{row.student_email}</span>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            width: '120px',
            render: (row) => (
              <Badge tone={statusTone(row.status)} size="sm">
                {row.status}
              </Badge>
            ),
          },
          {
            key: 'enrolled_at',
            header: 'Enrolled',
            width: '140px',
            render: (row) => formatDate(row.enrolled_at),
          },
        ]}
        rows={data?.items || []}
        rowKey={(row) => row.enrollment_id}
        loading={loading && !data}
        error={error}
        onRetry={reload}
        page={pager.meta.page}
        pages={pager.meta.pages}
        total={pager.meta.total}
        perPage={pager.meta.per_page}
        onPageChange={pager.setPage}
        itemLabel="enrollments"
        emptyTitle="Nobody is enrolled"
        emptyDescription="Publish the course so students can find and enrol in it."
        emptyIcon="users"
        caption="Students enrolled in this course"
      />
    </Card>
  );
}
