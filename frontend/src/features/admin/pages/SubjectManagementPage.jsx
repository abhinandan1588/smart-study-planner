import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import Drawer from '../../../components/ui/Drawer';
import EmptyState from '../../../components/ui/EmptyState';
import IconButton from '../../../components/ui/IconButton';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate } from '../../../utils/date';
import { formatNumber } from '../../../utils/format';
import { statusTone } from '../../../utils/constants';
import '../admin.css';

/**
 * Subject management (PRD 4.5) — `GET|POST /api/v1/admin/subjects`,
 * `PATCH|DELETE /admin/subjects/:id`, `PATCH /admin/subjects/reorder`.
 *
 * Subjects are shared between courses through the many-to-many link, so the
 * display order only exists *within a course*: picking a course switches the
 * page into the ordered view where the up/down controls persist a new order.
 * Deleting archives by default — syllabus units, topics and student progress
 * are preserved.
 */

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function SubjectManagementPage() {
  const toast = useToast();
  const pager = usePagination({ initialSort: 'name' });

  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState('');
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // subject or 'new'
  const [archiving, setArchiving] = useState(null);
  const [inspecting, setInspecting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ordered, setOrdered] = useState([]);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, status, pager.search]);

  useEffect(() => {
    adminApi.courses
      .list({ per_page: 100, sort: 'title' })
      .then((payload) =>
        setCourses(
          (payload.items || []).map((course) => ({
            value: String(course.id),
            label: `${course.title} (${course.status})`,
          })),
        ),
      )
      .catch(() => setCourses([]));
  }, []);

  const fetchSubjects = useCallback(
    () =>
      adminApi.subjects.list({
        ...pager.params,
        status,
        course_id: courseId,
        per_page: courseId ? 100 : pager.perPage,
      }),
    [pager.params, pager.perPage, status, courseId],
  );

  const { data, error, loading, reload } = useApi(fetchSubjects, {
    onSuccess: (payload) => {
      pager.applyMeta(payload);
      setOrdered(payload.items || []);
    },
  });

  async function move(index, delta) {
    const next = [...ordered];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);
    try {
      await adminApi.subjects.reorder(
        Number(courseId),
        next.map((subject, position) => ({
          subject_id: subject.id,
          display_order: position,
        })),
      );
    } catch (caught) {
      setOrdered(data?.items || []); // revert to the server's order
      toast.apiError(caught, 'Could not save the new order');
    }
  }

  async function archive() {
    if (!archiving) return;
    setBusy(true);
    try {
      const result = await adminApi.subjects.archive(archiving.id);
      toast.success(
        result.changed ? 'Subject archived' : 'Already archived',
        result.message,
      );
      setArchiving(null);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not archive the subject');
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Subject',
      sortable: !courseId,
      render: (row) => (
        <div className="sp-adm__primary">
          <strong>{row.name}</strong>
          <span className="sp-adm__sub">
            /{row.slug}
            {row.weightage ? ` · weightage ${row.weightage}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: !courseId,
      width: '110px',
      render: (row) => (
        <Badge tone={statusTone(row.status)} size="sm" dot>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'course_count',
      header: 'Courses',
      align: 'right',
      width: '90px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.course_count),
    },
    {
      key: 'unit_count',
      header: 'Units',
      align: 'right',
      width: '80px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.unit_count),
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
      key: 'created_at',
      header: 'Created',
      sortable: !courseId,
      width: '120px',
      hideOnMobile: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '250px',
      render: (row) => (
        <div className="sp-adm__rowactions">
          <Button size="sm" variant="ghost" onClick={() => setInspecting(row)}>
            Details
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
            Edit
          </Button>
          {row.status === 'archived' ? null : (
            <Button
              size="sm"
              variant="danger"
              className="sp-adm__dangerbtn"
              onClick={() => setArchiving(row)}
            >
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  const hasFilters = Boolean(status || pager.search);

  return (
    <div className="sp-page">
      <PageHeader
        title="Subject Management"
        description="Create subjects, link them to courses and control the order students see them in."
        actions={
          <Button variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
            New subject
          </Button>
        }
      />

      <Card title="Scope">
        <div className="sp-adm__filters">
          <Select
            label="Course"
            placeholder="All subjects (unordered)"
            options={courses}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            hint={
              courseId
                ? 'Ordering controls are active for this course.'
                : 'Pick a course to reorder its subjects.'
            }
          />
          <Select
            label="Status"
            placeholder="Any status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button
              variant="secondary"
              disabled={!hasFilters && !courseId}
              onClick={() => {
                setStatus('');
                setCourseId('');
                pager.setSearch('');
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {courseId ? (
        <Card
          title="Subject order"
          subtitle="The sequence students see inside this course"
          actions={
            <Button size="sm" variant="secondary" iconLeft="refresh" onClick={reload}>
              Refresh
            </Button>
          }
        >
          {loading && !data ? (
            <p className="sp-muted">Loading subjects…</p>
          ) : ordered.length ? (
            <ul className="sp-adm__list">
              {ordered.map((subject, index) => (
                <li key={subject.id}>
                  <span className="sp-adm__primary">
                    <span className="sp-adm__itemtitle">
                      {index + 1}. {subject.name}
                    </span>
                    <span className="sp-adm__itemmeta">
                      {formatNumber(subject.unit_count)} units ·{' '}
                      {formatNumber(subject.topic_count)} topics
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
                      disabled={index === ordered.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(subject)}>
                      Edit
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="layers"
              title="This course has no subjects linked"
              description="Link an existing subject from the course editor, or create one here and attach it to the course."
              compact
              action={
                <Button
                  size="sm"
                  variant="primary"
                  iconLeft="plus"
                  onClick={() => setEditing('new')}
                >
                  New subject
                </Button>
              }
            />
          )}
        </Card>
      ) : null}

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={courseId ? ordered : data?.items || []}
          loading={loading && !data}
          error={error}
          onRetry={reload}
          searchable
          searchValue={pager.search}
          onSearch={pager.setSearch}
          searchPlaceholder="Search by name or slug…"
          sort={pager.sort}
          onSort={courseId ? undefined : pager.toggleSort}
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          paginated={!courseId}
          itemLabel="subjects"
          emptyTitle={hasFilters ? 'No subjects match these filters' : 'No subjects yet'}
          emptyDescription={
            hasFilters
              ? 'Clear the search or status filter.'
              : 'Create subjects such as "Indian Polity" or "Quantitative Aptitude", then link them to courses.'
          }
          emptyIcon="layers"
          emptyAction={
            <Button size="sm" variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
              New subject
            </Button>
          }
          caption="Subjects"
        />
      </Card>

      <SubjectFormDrawer
        open={Boolean(editing)}
        subject={editing === 'new' ? null : editing}
        courses={courses}
        defaultCourseId={courseId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <SubjectDetailDrawer
        subject={inspecting}
        onClose={() => setInspecting(null)}
        onEdit={(subject) => {
          setInspecting(null);
          setEditing(subject);
        }}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Archive this subject?"
        message={
          archiving
            ? `"${archiving.name}" is removed from the active list. Its ${formatNumber(
                archiving.unit_count,
              )} syllabus unit(s), ${formatNumber(
                archiving.topic_count,
              )} topic(s) and every student progress record are preserved.`
            : ''
        }
        confirmLabel="Archive subject"
        loading={busy}
        onConfirm={archive}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}

/* --- create / edit ------------------------------------------------------ */

function SubjectFormDrawer({
  open,
  subject,
  courses,
  defaultCourseId,
  onClose,
  onSaved,
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    weightage: '',
    status: 'active',
    course_id: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: subject?.name || '',
      slug: subject?.slug || '',
      description: subject?.description || '',
      weightage:
        subject?.weightage === null || subject?.weightage === undefined
          ? ''
          : String(subject.weightage),
      status: subject?.status || 'active',
      course_id: subject ? '' : defaultCourseId || '',
    });
    setFieldErrors({});
    setFormError(null);
  }, [open, subject, defaultCourseId]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      weightage: form.weightage === '' ? null : Number(form.weightage),
      status: form.status,
    };
    if (form.slug.trim()) payload.slug = form.slug.trim();
    if (!subject && form.course_id) payload.course_id = Number(form.course_id);

    try {
      const result = subject
        ? await adminApi.subjects.update(subject.id, payload)
        : await adminApi.subjects.create(payload);
      toast.success(subject ? 'Subject updated' : 'Subject created', result.subject?.name);
      onSaved?.(result.subject);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (caught.code === 'CONFLICT') {
        setFieldErrors((current) => ({ ...current, slug: caught.message }));
      } else if (!caught.fields) {
        setFormError(caught.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={subject ? 'Edit subject' : 'New subject'}
      description={
        subject
          ? 'Renaming a subject never touches syllabus units or student progress.'
          : 'A subject can be linked to several courses.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="sp-subject-form" loading={busy}>
            {subject ? 'Save changes' : 'Create subject'}
          </Button>
        </>
      }
    >
      <form id="sp-subject-form" className="sp-stack" onSubmit={submit} noValidate>
        {formError ? (
          <p className="sp-adm__error" role="alert">
            {formError}
          </p>
        ) : null}
        <Input
          label="Subject name"
          required
          value={form.name}
          error={fieldErrors.name}
          maxLength={200}
          placeholder="Indian Polity"
          onChange={(event) => set('name', event.target.value)}
        />
        <Input
          label="Slug"
          value={form.slug}
          error={fieldErrors.slug}
          maxLength={220}
          hint={subject ? 'Must stay unique.' : 'Leave blank to derive it from the name.'}
          onChange={(event) => set('slug', event.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          error={fieldErrors.description}
          maxLength={3000}
          onChange={(event) => set('description', event.target.value)}
        />
        <div className="sp-adm__filters">
          <Input
            label="Weightage"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={form.weightage}
            error={fieldErrors.weightage}
            hint="Optional, 0–100"
            onChange={(event) => set('weightage', event.target.value)}
          />
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={form.status}
            error={fieldErrors.status}
            onChange={(event) => set('status', event.target.value)}
          />
          {subject ? null : (
            <Select
              label="Link to course"
              placeholder="Do not link yet"
              options={courses}
              value={form.course_id}
              error={fieldErrors.course_id}
              onChange={(event) => set('course_id', event.target.value)}
            />
          )}
        </div>
      </form>
    </Drawer>
  );
}

/* --- detail ------------------------------------------------------------- */

function SubjectDetailDrawer({ subject, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!subject) {
      setDetail(null);
      setFailed(null);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(null);
    adminApi.subjects
      .get(subject.id)
      .then((payload) => {
        if (active) setDetail(payload);
      })
      .catch((caught) => {
        if (active) setFailed(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subject]);

  return (
    <Drawer
      open={Boolean(subject)}
      onClose={onClose}
      title={subject?.name || 'Subject'}
      description={subject ? `/${subject.slug}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" iconLeft="edit" onClick={() => onEdit(subject)}>
            Edit subject
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="sp-muted">Loading subject…</p>
      ) : failed ? (
        <p className="sp-adm__error">{failed.message}</p>
      ) : detail ? (
        <div className="sp-stack">
          {detail.subject.description ? (
            <p className="sp-adm__previewbody">{detail.subject.description}</p>
          ) : null}

          <Card title="Courses using this subject">
            {detail.courses?.length ? (
              <ul className="sp-adm__list">
                {detail.courses.map((link) => (
                  <li key={link.course_id}>
                    <span className="sp-adm__primary">
                      <span className="sp-adm__itemtitle">{link.course_title}</span>
                      <span className="sp-adm__itemmeta">
                        Position {link.display_order + 1}
                        {link.weightage ? ` · weightage ${link.weightage}` : ''}
                      </span>
                    </span>
                    <Badge tone={statusTone(link.course_status)} size="sm">
                      {link.course_status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-muted">Not linked to any course yet.</p>
            )}
          </Card>

          <Card title="Syllabus units">
            {detail.units?.length ? (
              <ul className="sp-adm__list">
                {detail.units.map((unit) => (
                  <li key={unit.id}>
                    <span className="sp-adm__primary">
                      <span className="sp-adm__itemtitle">{unit.title}</span>
                      <span className="sp-adm__itemmeta">
                        {unit.unit_type} · {formatNumber(unit.topic_count)} topics ·
                        version #{unit.syllabus_version_id}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-muted">
                No units yet. Add them from the syllabus editor.
              </p>
            )}
          </Card>
        </div>
      ) : null}
    </Drawer>
  );
}
