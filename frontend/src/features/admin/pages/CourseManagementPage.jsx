import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import Select from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate } from '../../../utils/date';
import { formatNumber } from '../../../utils/format';
import {
  COURSE_CATEGORY_LABELS,
  COURSE_CATEGORY_OPTIONS,
  COURSE_STATUS_LABELS,
  COURSE_STATUS_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import CourseFormDrawer from '../components/CourseFormDrawer';
import '../admin.css';

/**
 * Course management (PRD 4.4) — `GET|POST /api/v1/admin/courses`,
 * `PATCH /admin/courses/:id`, `POST /admin/courses/:id/publish|unpublish`,
 * `DELETE /admin/courses/:id` (archive).
 *
 * The lifecycle is draft → published → archived, and a course can be moved
 * back to draft. Taking a published course out of the catalogue affects
 * enrolled students, so the confirmation dialog states the impact and the
 * request carries `confirm=true`; enrollments and topic progress are always
 * preserved.
 */

const TRANSITIONS = {
  publish: {
    title: 'Publish this course?',
    confirmLabel: 'Publish course',
    tone: 'primary',
    describe: (course) =>
      `"${course.title}" becomes visible to eligible students and open for enrollment.${
        course.topic_count ? '' : ' It has no published syllabus topics yet.'
      }`,
    run: (course) => adminApi.courses.publish(course.id),
  },
  unpublish: {
    title: 'Move this course back to draft?',
    confirmLabel: 'Unpublish course',
    tone: 'danger',
    describe: (course) =>
      `"${course.title}" is removed from the student catalogue. ${formatNumber(
        course.active_enrollment_count,
      )} active enrollment(s) and all topic progress are preserved.`,
    run: (course) => adminApi.courses.unpublish(course.id, { confirm: true }),
  },
  archive: {
    title: 'Archive this course?',
    confirmLabel: 'Archive course',
    tone: 'danger',
    describe: (course) =>
      `"${course.title}" is archived and no longer offered. ${formatNumber(
        course.enrollment_count,
      )} enrollment(s) and their historical progress are kept intact.`,
    run: (course) => adminApi.courses.archive(course.id, { confirm: true }),
  },
};

export default function CourseManagementPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const pager = usePagination({ initialSort: '-updated_at' });

  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null); // course object or 'new'
  const [action, setAction] = useState(null); // { kind, course }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, pager.search]);

  const fetchCourses = useCallback(
    () => adminApi.courses.list({ ...pager.params, status, category }),
    [pager.params, status, category],
  );

  const { data, error, loading, reload } = useApi(fetchCourses, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  async function runAction() {
    if (!action) return;
    const transition = TRANSITIONS[action.kind];
    setBusy(true);
    try {
      const result = await transition.run(action.course);
      toast.success(
        'Course updated',
        result.course
          ? `${result.course.title} is now ${labelFor(
              COURSE_STATUS_LABELS,
              result.course.status,
            ).toLowerCase()}.`
          : undefined,
      );
      if (result.warning) toast.warning('Check the syllabus', result.warning);
      setAction(null);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'The lifecycle change was refused');
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Course',
      sortable: true,
      render: (row) => (
        <div className="sp-adm__primary">
          <Link to={`/admin/courses/${row.id}`}>
            <strong>{row.title}</strong>
          </Link>
          <span className="sp-adm__sub">
            /{row.slug} · {labelFor(COURSE_CATEGORY_LABELS, row.category)}
            {row.level ? ` · ${row.level}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '120px',
      render: (row) => (
        <Badge tone={statusTone(row.status)} size="sm" dot>
          {labelFor(COURSE_STATUS_LABELS, row.status)}
        </Badge>
      ),
    },
    {
      key: 'subject_count',
      header: 'Subjects',
      align: 'right',
      width: '90px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.subject_count),
    },
    {
      key: 'topic_count',
      header: 'Topics',
      align: 'right',
      width: '80px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.topic_count),
    },
    {
      key: 'enrollment_count',
      header: 'Enrolled',
      align: 'right',
      width: '100px',
      hideOnMobile: true,
      render: (row) => (
        <span>
          {formatNumber(row.active_enrollment_count)}
          {row.enrollment_count !== row.active_enrollment_count
            ? ` / ${formatNumber(row.enrollment_count)}`
            : ''}
        </span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      sortable: true,
      width: '120px',
      hideOnMobile: true,
      render: (row) => formatDate(row.updated_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '300px',
      render: (row) => (
        <div
          className="sp-adm__rowactions"
          onClick={(event) => event.stopPropagation()}
        >
          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
            Edit
          </Button>
          {row.status === 'draft' || row.status === 'archived' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setAction({ kind: 'publish', course: row })}
            >
              Publish
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAction({ kind: 'unpublish', course: row })}
            >
              Unpublish
            </Button>
          )}
          {row.status === 'archived' ? null : (
            <Button
              size="sm"
              variant="danger"
              className="sp-adm__dangerbtn"
              onClick={() => setAction({ kind: 'archive', course: row })}
            >
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  const transition = action ? TRANSITIONS[action.kind] : null;
  const hasFilters = Boolean(status || category || pager.search);

  return (
    <div className="sp-page">
      <PageHeader
        title="Course Management"
        description="Create courses, manage the draft → published → archived lifecycle and link subjects."
        actions={
          <Button variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
            New course
          </Button>
        }
      />

      <Card title="Filters">
        <div className="sp-adm__filters">
          <Select
            label="Status"
            placeholder="Any status"
            options={COURSE_STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Select
            label="Category"
            placeholder="Any category"
            options={COURSE_CATEGORY_OPTIONS}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button
              variant="secondary"
              disabled={!hasFilters}
              onClick={() => {
                setStatus('');
                setCategory('');
                pager.setSearch('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={data?.items || []}
          loading={loading && !data}
          error={error}
          onRetry={reload}
          searchable
          searchValue={pager.search}
          onSearch={pager.setSearch}
          searchPlaceholder="Search title, slug or description…"
          sort={pager.sort}
          onSort={pager.toggleSort}
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          itemLabel="courses"
          emptyTitle={hasFilters ? 'No courses match these filters' : 'No courses yet'}
          emptyDescription={
            hasFilters
              ? 'Clear the status or category filter to see the rest of the catalogue.'
              : 'Create a course, add subjects, then build its syllabus.'
          }
          emptyIcon="courses"
          emptyAction={
            <Button size="sm" variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
              New course
            </Button>
          }
          caption="Course catalogue"
          onRowClick={(row) => navigate(`/admin/courses/${row.id}`)}
        />
      </Card>

      <CourseFormDrawer
        open={Boolean(editing)}
        course={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(course) => {
          setEditing(null);
          if (course && editing === 'new') navigate(`/admin/courses/${course.id}`);
          else reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(action)}
        title={transition?.title}
        message={action ? transition.describe(action.course) : ''}
        confirmLabel={transition?.confirmLabel}
        tone={transition?.tone}
        loading={busy}
        onConfirm={runAction}
        onClose={() => setAction(null)}
      />
    </div>
  );
}
