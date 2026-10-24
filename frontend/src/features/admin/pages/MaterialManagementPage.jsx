import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import MetricTile from '../../../components/ui/MetricTile';
import Select from '../../../components/ui/Select';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate } from '../../../utils/date';
import { formatBytes, formatNumber } from '../../../utils/format';
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_OPTIONS,
  VISIBILITY_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import ResourceFormDrawer from '../components/ResourceFormDrawer';
import '../admin.css';

/**
 * Study material management (PRD 4.7) — `GET|POST /api/v1/admin/resources`,
 * `PATCH /admin/resources/:id`, `POST /admin/resources/:id/publish|unpublish`,
 * `DELETE /admin/resources/:id(?hard=&confirm=)`,
 * `GET /admin/resources/:id/file` and `GET /admin/resources/storage`.
 *
 * The "Student uploads" scope lists private uploads for storage accounting
 * only: the API refuses to open or edit them, and this page offers no action
 * that would try.
 */

const SCOPES = [
  { key: 'shared', label: 'Admin material' },
  { key: 'student', label: 'Student uploads' },
  { key: 'all', label: 'Everything' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'enrolled_only', label: 'Enrolled students' },
  { value: 'private', label: 'Private (student upload)' },
];

export default function MaterialManagementPage() {
  const toast = useToast();
  const pager = usePagination();

  const [scope, setScope] = useState('shared');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  const [editing, setEditing] = useState(null); // resource or 'new'
  const [removing, setRemoving] = useState(null); // { resource, hard }
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, type, status, visibility, courseId, pager.search]);

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

  const fetchResources = useCallback(
    () =>
      adminApi.resources.list({
        ...pager.params,
        scope,
        type,
        status,
        visibility,
        course_id: courseId,
      }),
    [pager.params, scope, type, status, visibility, courseId],
  );
  const { data, error, loading, reload } = useApi(fetchResources, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  const fetchStorage = useCallback(() => adminApi.resources.storage(), []);
  const { data: storage, reload: reloadStorage } = useApi(fetchStorage);

  async function togglePublication(resource) {
    try {
      const result =
        resource.status === 'published'
          ? await adminApi.resources.unpublish(resource.id)
          : await adminApi.resources.publish(resource.id);
      toast.success(
        result.resource.status === 'published' ? 'Material published' : 'Material unpublished',
        result.notified_students
          ? `${result.notified_students} student(s) notified.`
          : undefined,
      );
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not change the publication status');
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      if (removing.hard) {
        await adminApi.resources.remove(removing.resource.id, {
          hard: true,
          confirm: true,
        });
        toast.success('Material deleted', 'The stored file was removed.');
      } else {
        const result = await adminApi.resources.remove(removing.resource.id);
        toast.success('Material archived', result.message);
      }
      setRemoving(null);
      await reload();
      await reloadStorage();
    } catch (caught) {
      toast.apiError(caught, 'Could not remove the material');
    } finally {
      setBusy(false);
    }
  }

  async function open(resource) {
    if (resource.external_url && !resource.has_file) {
      window.open(resource.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setDownloadingId(resource.id);
    try {
      await adminApi.resources.downloadFile(resource);
    } catch (caught) {
      toast.apiError(caught, 'Could not open the file');
    } finally {
      setDownloadingId(null);
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Material',
      render: (row) => (
        <div className="sp-adm__primary">
          <strong>{row.title}</strong>
          <span className="sp-adm__sub">
            {labelFor(RESOURCE_TYPE_LABELS, row.resource_type)}
            {row.course_title ? ` · ${row.course_title}` : ''}
            {row.topic_title ? ` · ${row.topic_title}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '190px',
      render: (row) => (
        <div className="sp-adm__chips">
          <Badge tone={statusTone(row.status)} size="sm" dot>
            {row.status}
          </Badge>
          <Badge tone={statusTone(row.visibility)} size="sm">
            {labelFor(VISIBILITY_LABELS, row.visibility)}
          </Badge>
        </div>
      ),
    },
    {
      key: 'file_size_bytes',
      header: 'Size',
      align: 'right',
      width: '90px',
      hideOnMobile: true,
      render: (row) => (row.file_size_bytes ? formatBytes(row.file_size_bytes) : '—'),
    },
    {
      key: 'download_count',
      header: 'Downloads',
      align: 'right',
      width: '110px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.download_count),
    },
    {
      key: 'created_at',
      header: 'Added',
      width: '120px',
      hideOnMobile: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '340px',
      render: (row) => {
        const isStudentUpload = row.owner_id !== null && row.owner_id !== undefined;
        if (isStudentUpload) {
          return (
            <Badge tone="neutral" size="sm">
              Private student upload
            </Badge>
          );
        }
        return (
          <div className="sp-adm__rowactions">
            {row.has_file || row.external_url ? (
              <Button
                size="sm"
                variant="ghost"
                iconLeft={row.has_file ? 'download' : 'chevronRight'}
                loading={downloadingId === row.id}
                onClick={() => open(row)}
              >
                {row.has_file ? 'Open' : 'Visit'}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant={row.status === 'published' ? 'secondary' : 'primary'}
              onClick={() => togglePublication(row)}
            >
              {row.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="sp-adm__dangerbtn"
              onClick={() =>
                setRemoving({ resource: row, hard: row.status === 'archived' })
              }
            >
              {row.status === 'archived' ? 'Delete' : 'Archive'}
            </Button>
          </div>
        );
      },
    },
  ];

  const hasFilters = Boolean(type || status || visibility || courseId || pager.search);

  return (
    <div className="sp-page">
      <PageHeader
        title="Study Material Management"
        description="Upload, organise, publish and retire the resources students can read."
        actions={
          <Button variant="primary" iconLeft="upload" onClick={() => setEditing('new')}>
            Upload material
          </Button>
        }
      />

      {storage ? (
        <div className="sp-adm__metrics">
          <MetricTile
            label="Admin material"
            value={formatNumber(storage.shared_count)}
            sub={`${formatNumber(storage.student_upload_count)} student uploads`}
            icon="folder"
          />
          <MetricTile
            label="Tracked size"
            value={formatBytes(storage.tracked_bytes)}
            sub={`${formatNumber(storage.disk?.file_count)} files on disk`}
            icon="layers"
          />
          <MetricTile
            label="Disk usage"
            value={formatBytes(storage.disk?.total_bytes)}
            sub={`Limit ${storage.max_upload_mb} MB per upload`}
            icon="upload"
          />
          <MetricTile
            label="Upload failures"
            value={formatNumber(storage.failures?.length)}
            sub={
              storage.failures?.length
                ? 'Stored file missing from disk'
                : 'Every stored file is readable'
            }
            icon={storage.failures?.length ? 'warning' : 'check'}
            tone={storage.failures?.length ? 'danger' : 'success'}
          />
        </div>
      ) : null}

      {storage?.failures?.length ? (
        <Card title="Upload failures" subtitle="Rows whose stored file is missing">
          <ul className="sp-adm__list">
            {storage.failures.map((failure) => (
              <li key={failure.resource_id}>
                <span className="sp-adm__primary">
                  <span className="sp-adm__itemtitle">{failure.title}</span>
                  <span className="sp-adm__itemmeta">{failure.reason}</span>
                </span>
                <span className="sp-adm__mono">#{failure.resource_id}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Tabs items={SCOPES} active={scope} onChange={setScope} ariaLabel="Material scope" />

      <Card title="Filters">
        <div className="sp-adm__filters">
          <Select
            label="Type"
            placeholder="Any type"
            options={RESOURCE_TYPE_OPTIONS}
            value={type}
            onChange={(event) => setType(event.target.value)}
          />
          <Select
            label="Status"
            placeholder="Any status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Select
            label="Visibility"
            placeholder="Any visibility"
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          />
          <Select
            label="Course"
            placeholder="Any course"
            options={courses}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button
              variant="secondary"
              disabled={!hasFilters}
              onClick={() => {
                setType('');
                setStatus('');
                setVisibility('');
                setCourseId('');
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
          searchPlaceholder="Search title, description or tag…"
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          itemLabel="materials"
          emptyTitle={
            hasFilters ? 'No materials match these filters' : 'No study material yet'
          }
          emptyDescription={
            hasFilters
              ? 'Clear a filter, or switch scope to see student uploads.'
              : 'Upload a PDF, document or practice set and attach it to a course, subject or topic.'
          }
          emptyIcon="folder"
          emptyAction={
            <Button size="sm" variant="primary" iconLeft="upload" onClick={() => setEditing('new')}>
              Upload material
            </Button>
          }
          caption="Study materials"
        />
      </Card>

      <ResourceFormDrawer
        open={Boolean(editing)}
        resource={editing === 'new' ? null : editing}
        courses={courses}
        limits={storage}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
          reloadStorage();
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.hard ? 'Delete this material permanently?' : 'Archive this material?'}
        message={
          removing
            ? removing.hard
              ? `"${removing.resource.title}" and its stored file are removed for good. It has been downloaded ${formatNumber(
                  removing.resource.download_count,
                )} time(s).`
              : `"${removing.resource.title}" is archived and hidden from students. The stored file is retained so it can be restored.`
            : ''
        }
        confirmLabel={removing?.hard ? 'Delete permanently' : 'Archive material'}
        loading={busy}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
