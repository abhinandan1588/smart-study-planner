import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import Drawer from '../../../components/ui/Drawer';
import Input from '../../../components/ui/Input';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime, toDateTimeInput } from '../../../utils/date';
import { formatNumber } from '../../../utils/format';
import {
  PUBLISH_STATUS_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import '../admin.css';

/**
 * Announcements and notifications (PRD 4.8) —
 * `GET|POST /api/v1/admin/announcements`,
 * `PATCH|DELETE /admin/announcements/:id`,
 * `POST /admin/announcements/:id/publish`,
 * `POST /admin/announcements/:id/expire`,
 * `GET /admin/announcements/:id/recipients`.
 *
 * Publishing fans the announcement out into per-student notifications. Each
 * row carries a dedupe key, so re-publishing never produces a duplicate
 * reminder — the delivery counters on this page come straight from those rows.
 */

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All active students' },
  { value: 'course', label: 'Students enrolled in a course' },
  { value: 'role', label: 'Everyone with a role' },
];

const ROLE_OPTIONS = [
  { value: 'student', label: 'Students' },
  { value: 'admin', label: 'Administrators' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

function audienceLabel(announcement) {
  if (announcement.audience === 'course') {
    return `Course: ${announcement.course_title || `#${announcement.course_id}`}`;
  }
  if (announcement.audience === 'role') {
    return `Role: ${announcement.target_role}`;
  }
  return 'All students';
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const pager = usePagination();

  const [status, setStatus] = useState('');
  const [audience, setAudience] = useState('');
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // announcement or 'new'
  const [previewing, setPreviewing] = useState(null);
  const [action, setAction] = useState(null); // { kind, announcement }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, audience, pager.search]);

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

  const fetchAnnouncements = useCallback(
    () => adminApi.announcements.list({ ...pager.params, status, audience }),
    [pager.params, status, audience],
  );
  const { data, error, loading, reload } = useApi(fetchAnnouncements, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  async function runAction() {
    if (!action) return;
    const { kind, announcement } = action;
    setBusy(true);
    try {
      if (kind === 'publish') {
        const result = await adminApi.announcements.publish(announcement.id);
        toast.success(
          'Announcement published',
          `${formatNumber(result.fan_out?.notifications_created)} notification(s) created for ${formatNumber(
            result.fan_out?.targeted,
          )} student(s).`,
        );
      } else if (kind === 'expire') {
        const result = await adminApi.announcements.expire(announcement.id);
        toast.success('Announcement expired', result.message);
      } else if (kind === 'archive') {
        await adminApi.announcements.remove(announcement.id);
        toast.success('Announcement archived', 'Delivered notices are left in place.');
      } else if (kind === 'delete') {
        await adminApi.announcements.remove(announcement.id, { hard: true });
        toast.success('Announcement deleted');
      }
      setAction(null);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'The action failed');
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Announcement',
      render: (row) => (
        <div className="sp-adm__primary">
          <strong>{row.title}</strong>
          <span className="sp-adm__sub">{audienceLabel(row)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
      render: (row) => (
        <Badge tone={statusTone(row.status)} size="sm" dot>
          {labelFor(PUBLISH_STATUS_LABELS, row.status)}
        </Badge>
      ),
    },
    {
      key: 'delivery',
      header: 'Delivery',
      width: '180px',
      hideOnMobile: true,
      render: (row) =>
        row.delivery?.delivered ? (
          <div className="sp-adm__primary">
            <span className="sp-adm__sub">
              {formatNumber(row.delivery.read)} of{' '}
              {formatNumber(row.delivery.delivered)} read
            </span>
            <ProgressBar
              value={row.delivery.read_percent}
              tone="primary"
              size="sm"
              label={`${row.title} read rate`}
            />
          </div>
        ) : (
          <span className="sp-adm__sub">
            {formatNumber(row.delivery?.targeted)} targeted, not delivered
          </span>
        ),
    },
    {
      key: 'publish_at',
      header: 'Publish / expiry',
      width: '180px',
      hideOnMobile: true,
      render: (row) => (
        <span className="sp-adm__sub">
          {row.publish_at ? formatDate(row.publish_at) : 'Not scheduled'}
          {row.expires_at ? ` → ${formatDate(row.expires_at)}` : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '320px',
      render: (row) => (
        <div className="sp-adm__rowactions">
          <Button size="sm" variant="ghost" onClick={() => setPreviewing(row)}>
            Preview
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
            Edit
          </Button>
          {row.status === 'published' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAction({ kind: 'expire', announcement: row })}
            >
              Expire
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setAction({ kind: 'publish', announcement: row })}
            >
              Publish
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            className="sp-adm__dangerbtn"
            onClick={() =>
              setAction({
                kind: row.status === 'archived' ? 'delete' : 'archive',
                announcement: row,
              })
            }
          >
            {row.status === 'archived' ? 'Delete' : 'Archive'}
          </Button>
        </div>
      ),
    },
  ];

  const hasFilters = Boolean(status || audience || pager.search);

  const ACTION_COPY = {
    publish: {
      title: 'Publish this announcement?',
      message: (row) =>
        `"${row.title}" is sent to ${audienceLabel(row).toLowerCase()}. One in-app notification is created per recipient; duplicates are impossible because each row carries the announcement's dedupe key.`,
      confirmLabel: 'Publish now',
      tone: 'primary',
    },
    expire: {
      title: 'Expire this announcement?',
      message: (row) =>
        `"${row.title}" stops being visible to students immediately and is archived. Notifications already delivered stay in their notification centre.`,
      confirmLabel: 'Expire now',
      tone: 'danger',
    },
    archive: {
      title: 'Archive this announcement?',
      message: (row) =>
        `"${row.title}" is archived and hidden from students. Delivered notifications are left in place.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    },
    delete: {
      title: 'Delete this announcement permanently?',
      message: (row) =>
        `"${row.title}" and its record are removed for good. Notifications already delivered to students remain in their notification centre.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    },
  };
  const copy = action ? ACTION_COPY[action.kind] : null;

  return (
    <div className="sp-page">
      <PageHeader
        title="Announcements & Notifications"
        description="Write announcements, target them, schedule publication and track delivery."
        actions={
          <Button variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
            New announcement
          </Button>
        }
      />

      <Card title="Filters">
        <div className="sp-adm__filters">
          <Select
            label="Status"
            placeholder="Any status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Select
            label="Audience"
            placeholder="Any audience"
            options={AUDIENCE_OPTIONS}
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button
              variant="secondary"
              disabled={!hasFilters}
              onClick={() => {
                setStatus('');
                setAudience('');
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
          searchPlaceholder="Search title or body…"
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          itemLabel="announcements"
          emptyTitle={
            hasFilters ? 'No announcements match these filters' : 'No announcements yet'
          }
          emptyDescription={
            hasFilters
              ? 'Clear the status or audience filter.'
              : 'Write an announcement, choose who should receive it, then publish or schedule it.'
          }
          emptyIcon="megaphone"
          emptyAction={
            <Button size="sm" variant="primary" iconLeft="plus" onClick={() => setEditing('new')}>
              New announcement
            </Button>
          }
          caption="Announcements"
        />
      </Card>

      <AnnouncementFormDrawer
        open={Boolean(editing)}
        announcement={editing === 'new' ? null : editing}
        courses={courses}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />

      <PreviewDialog
        announcement={previewing}
        onClose={() => setPreviewing(null)}
      />

      <ConfirmDialog
        open={Boolean(action)}
        title={copy?.title}
        message={action ? copy.message(action.announcement) : ''}
        confirmLabel={copy?.confirmLabel}
        tone={copy?.tone}
        loading={busy}
        onConfirm={runAction}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

/* --- create / edit ------------------------------------------------------ */

function AnnouncementFormDrawer({ open, announcement, courses, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'all',
    course_id: '',
    target_role: 'student',
    status: 'draft',
    publish_at: '',
    expires_at: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: announcement?.title || '',
      body: announcement?.body || '',
      audience: announcement?.audience || 'all',
      course_id: announcement?.course_id ? String(announcement.course_id) : '',
      target_role: announcement?.target_role || 'student',
      status: announcement?.status || 'draft',
      publish_at: announcement?.publish_at ? toDateTimeInput(announcement.publish_at) : '',
      expires_at: announcement?.expires_at ? toDateTimeInput(announcement.expires_at) : '',
    });
    setFieldErrors({});
    setFormError(null);
    setShowPreview(false);
  }, [open, announcement]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      status: form.status,
      publish_at: form.publish_at || null,
      expires_at: form.expires_at || null,
    };
    if (form.audience === 'course') payload.course_id = Number(form.course_id);
    if (form.audience === 'role') payload.target_role = form.target_role;

    try {
      const result = announcement
        ? await adminApi.announcements.update(announcement.id, payload)
        : await adminApi.announcements.create(payload);
      toast.success(
        announcement ? 'Announcement updated' : 'Announcement created',
        result.fan_out
          ? `${formatNumber(result.fan_out.notifications_created)} notification(s) created.`
          : undefined,
      );
      onSaved?.(result.announcement);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields) setFormError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title={announcement ? 'Edit announcement' : 'New announcement'}
      description="Choosing a future publish time stores it as scheduled instead of publishing straight away."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => setShowPreview((value) => !value)}>
            {showPreview ? 'Hide preview' : 'Preview'}
          </Button>
          <Button variant="primary" type="submit" form="sp-ann-form" loading={busy}>
            {announcement ? 'Save changes' : 'Create announcement'}
          </Button>
        </>
      }
    >
      <form id="sp-ann-form" className="sp-stack" onSubmit={submit} noValidate>
        {formError ? (
          <p className="sp-adm__error" role="alert">
            {formError}
          </p>
        ) : null}

        <Input
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          maxLength={250}
          onChange={(event) => set('title', event.target.value)}
        />
        <Textarea
          label="Body"
          required
          rows={8}
          value={form.body}
          error={fieldErrors.body}
          maxLength={20000}
          hint="Line breaks are preserved in the student notification centre."
          onChange={(event) => set('body', event.target.value)}
        />

        <div className="sp-adm__filters">
          <Select
            label="Audience"
            options={AUDIENCE_OPTIONS}
            value={form.audience}
            error={fieldErrors.audience}
            onChange={(event) => set('audience', event.target.value)}
          />
          {form.audience === 'course' ? (
            <Select
              label="Course"
              required
              placeholder="Choose a course"
              options={courses}
              value={form.course_id}
              error={fieldErrors.course_id}
              onChange={(event) => set('course_id', event.target.value)}
            />
          ) : null}
          {form.audience === 'role' ? (
            <Select
              label="Role"
              options={ROLE_OPTIONS}
              value={form.target_role}
              error={fieldErrors.target_role}
              onChange={(event) => set('target_role', event.target.value)}
            />
          ) : null}
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={form.status}
            error={fieldErrors.status}
            onChange={(event) => set('status', event.target.value)}
          />
        </div>

        <div className="sp-adm__filters">
          <DateInput
            mode="datetime"
            label="Publish at"
            value={form.publish_at}
            error={fieldErrors.publish_at}
            hint="Leave blank to publish immediately"
            onChange={(event) => set('publish_at', event.target.value)}
          />
          <DateInput
            mode="datetime"
            label="Expires at"
            value={form.expires_at}
            error={fieldErrors.expires_at}
            hint="Must be after the publish time"
            onChange={(event) => set('expires_at', event.target.value)}
          />
        </div>

        {showPreview ? (
          <Card title="Student preview" subtitle="How this reads in the notification centre">
            <p className="sp-adm__itemtitle">{form.title || 'Untitled announcement'}</p>
            <p className="sp-adm__previewbody">{form.body || 'No body yet.'}</p>
          </Card>
        ) : null}
      </form>
    </Drawer>
  );
}

/* --- preview + recipients ---------------------------------------------- */

function PreviewDialog({ announcement, onClose }) {
  const [recipients, setRecipients] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!announcement) {
      setRecipients(null);
      return;
    }
    let active = true;
    setLoading(true);
    adminApi.announcements
      .recipients(announcement.id, { per_page: 50 })
      .then((payload) => {
        if (active) setRecipients(payload);
      })
      .catch(() => {
        if (active) setRecipients(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [announcement]);

  return (
    <Dialog
      open={Boolean(announcement)}
      onClose={onClose}
      size="lg"
      title="Announcement preview"
      description={announcement ? audienceLabel(announcement) : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {announcement ? (
        <div className="sp-stack">
          <Card title={announcement.title}>
            <p className="sp-adm__previewbody">{announcement.body}</p>
          </Card>

          <dl className="sp-adm__dl">
            <div>
              <span className="sp-adm__dt">Status</span>
              <dd className="sp-adm__dd">
                <Badge tone={statusTone(announcement.status)} size="sm">
                  {labelFor(PUBLISH_STATUS_LABELS, announcement.status)}
                </Badge>
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Publish at</span>
              <dd className="sp-adm__dd">
                {announcement.publish_at
                  ? formatDateTime(announcement.publish_at)
                  : 'Not scheduled'}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Expires</span>
              <dd className="sp-adm__dd">
                {announcement.expires_at
                  ? formatDateTime(announcement.expires_at)
                  : 'No expiry'}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Created by</span>
              <dd className="sp-adm__dd">
                {announcement.created_by_email || '—'}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Targeted</span>
              <dd className="sp-adm__dd">
                {formatNumber(announcement.delivery?.targeted)}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Delivered / read</span>
              <dd className="sp-adm__dd">
                {formatNumber(announcement.delivery?.delivered)} /{' '}
                {formatNumber(announcement.delivery?.read)} (
                {announcement.delivery?.read_percent ?? 0}%)
              </dd>
            </div>
          </dl>

          <Card title="Recipients" subtitle="Who it targets and whether they have read it">
            {loading ? (
              <p className="sp-muted">Loading recipients…</p>
            ) : recipients?.items?.length ? (
              <ul className="sp-adm__list">
                {recipients.items.map((person) => (
                  <li key={person.student_id}>
                    <span className="sp-adm__primary">
                      <span className="sp-adm__itemtitle">{person.full_name}</span>
                      <span className="sp-adm__itemmeta">{person.email}</span>
                    </span>
                    <Badge tone={person.read ? 'success' : 'neutral'} size="sm">
                      {person.read ? 'Read' : 'Unread'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-muted">
                Nobody is targeted yet. Publishing fans the announcement out to the
                selected audience.
              </p>
            )}
          </Card>
        </div>
      ) : null}
    </Dialog>
  );
}
