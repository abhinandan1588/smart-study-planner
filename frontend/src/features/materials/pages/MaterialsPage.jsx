import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import Input from '../../../components/ui/Input';
import Pagination from '../../../components/ui/Pagination';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Tabs from '../../../components/ui/Tabs';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import useDebounce from '../../../hooks/useDebounce';
import usePagination from '../../../hooks/usePagination';
import { materialsApi } from '../../../services/materialsApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate, relativeFromNow } from '../../../utils/date';
import { formatBytes, formatNumber } from '../../../utils/format';
import {
  RESOURCE_TYPE_LABELS,
  VISIBILITY_LABELS,
  labelFor,
  optionsFrom,
  statusTone,
} from '../../../utils/constants';
import './materials.css';

/* Mirrors backend config: ALLOWED_UPLOAD_EXTENSIONS and MAX_UPLOAD_MB. */
const MAX_UPLOAD_MB = 20;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'txt', 'md', 'csv'];

/* Mirrors backend TYPE_EXTENSIONS so the hint matches the server's own rule. */
const TYPE_EXTENSIONS = {
  pdf: ['pdf'],
  document: ['pdf', 'doc', 'docx', 'txt', 'md'],
  image: ['png', 'jpg', 'jpeg'],
  note: ['pdf', 'txt', 'md', 'doc', 'docx'],
  practice_set: ['pdf', 'doc', 'docx', 'csv', 'txt', 'md'],
  revision_sheet: ['pdf', 'doc', 'docx', 'txt', 'md'],
};

const UPLOAD_TYPE_OPTIONS = optionsFrom({
  note: 'Note',
  pdf: 'PDF',
  document: 'Document',
  image: 'Image',
  practice_set: 'Practice set',
  revision_sheet: 'Revision sheet',
});

const SCOPES = [
  { key: 'all', label: 'All available' },
  { key: 'shared', label: 'Course material' },
  { key: 'mine', label: 'My uploads' },
  { key: 'bookmarked', label: 'Bookmarked' },
];

const TYPE_ICONS = {
  pdf: 'book',
  document: 'book',
  image: 'folder',
  link: 'chevronRight',
  practice_set: 'check',
  revision_sheet: 'refresh',
  note: 'edit',
};

function extensionOf(name) {
  const parts = String(name || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Study materials (PRD 3.10).
 *
 * Listing comes from `GET /api/v1/student/resources` (already filtered to what
 * the caller may see). Files are never linked directly: `download_url` points
 * at a token route that re-checks permission on every fetch and is streamed
 * through axios as a Blob.
 */
export default function MaterialsPage() {
  const toast = useToast();
  const pager = usePagination({ perPage: 12 });
  const [scope, setScope] = useState('all');
  const [type, setType] = useState('');
  const [courseId, setCourseId] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounce(searchDraft, 300);
  const [courses, setCourses] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, type, courseId, search]);

  const fetchResources = useCallback(
    () =>
      materialsApi.list({
        page: pager.page,
        per_page: pager.perPage,
        scope,
        type,
        course_id: courseId,
        q: search,
      }),
    [pager.page, pager.perPage, scope, type, courseId, search],
  );
  const { data, error, loading, reload } = useApi(fetchResources, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  const fetchRecent = useCallback(() => materialsApi.recent(), []);
  const { data: recent, reload: reloadRecent } = useApi(fetchRecent);

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

  async function open(resource) {
    if (resource.external_url) {
      window.open(resource.external_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setDownloadingId(resource.id);
    try {
      await materialsApi.downloadFile(resource);
      reloadRecent();
    } catch (caught) {
      toast.apiError(caught, 'Could not open the file');
    } finally {
      setDownloadingId(null);
    }
  }

  async function toggleBookmark(resource) {
    try {
      const result = await materialsApi.toggleBookmark(resource.id);
      toast.info(result.bookmarked ? 'Bookmarked' : 'Bookmark removed', resource.title);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not update the bookmark');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await materialsApi.remove(deleting.id);
      toast.success('Upload deleted');
      setDeleting(null);
      reload();
      reloadRecent();
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the upload');
    } finally {
      setRemoving(false);
    }
  }

  const items = data?.items || [];

  return (
    <div className="sp-page">
      <PageHeader
        title="Study Materials"
        description="Course resources you are authorised to read, plus your own private uploads."
        actions={
          <Button variant="primary" iconLeft="upload" onClick={() => setUploadOpen(true)}>
            Upload note
          </Button>
        }
      />

      <Tabs items={SCOPES} active={scope} onChange={setScope} ariaLabel="Material scope" />

      <Card>
        <div className="sp-mat__filters">
          <Input
            label="Search"
            type="search"
            iconLeft="search"
            value={searchDraft}
            placeholder="Title, description or tag…"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Select
            label="Type"
            placeholder="Any type"
            options={optionsFrom(RESOURCE_TYPE_LABELS)}
            value={type}
            onChange={(event) => setType(event.target.value)}
          />
          <Select
            label="Course"
            placeholder="All courses"
            options={courses}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          />
        </div>
      </Card>

      {recent?.items?.length ? (
        <Card title="Recently opened" subtitle="Your last accessed materials">
          <div className="sp-row sp-row--wrap">
            {recent.items.slice(0, 6).map((item) => (
              <Button
                key={`recent-${item.id}`}
                size="sm"
                variant="secondary"
                iconLeft={TYPE_ICONS[item.resource_type] || 'book'}
                loading={downloadingId === item.id}
                onClick={() => open(item)}
              >
                {item.title}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={reload} boxed />
      ) : loading && !data ? (
        <div className="sp-mat__grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="sp-matcard" key={index}>
              <Skeleton variant="text" width="65%" />
              <Skeleton variant="text" count={2} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="folder"
            title={
              scope === 'mine'
                ? 'You have not uploaded anything yet'
                : 'No materials match these filters'
            }
            description={
              scope === 'mine'
                ? 'Upload a private PDF or note and attach it to a syllabus topic.'
                : 'Clear a filter, or enroll in a course to unlock its shared material.'
            }
            action={
              <Button
                variant="primary"
                size="sm"
                iconLeft="upload"
                onClick={() => setUploadOpen(true)}
              >
                Upload note
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="sp-mat__grid">
            {items.map((resource) => (
              <article className="sp-matcard" key={resource.id}>
                <div className="sp-matcard__head">
                  <span className="sp-matcard__icon">
                    <Icon name={TYPE_ICONS[resource.resource_type] || 'book'} size={18} />
                  </span>
                  <div className="sp-matcard__body">
                    <p className="sp-matcard__title">{resource.title}</p>
                    {resource.description ? (
                      <p className="sp-matcard__desc">{resource.description}</p>
                    ) : null}
                  </div>
                  <IconButton
                    icon="target"
                    size="sm"
                    label={
                      resource.is_bookmarked
                        ? `Remove bookmark from ${resource.title}`
                        : `Bookmark ${resource.title}`
                    }
                    variant={resource.is_bookmarked ? 'outline' : 'ghost'}
                    onClick={() => toggleBookmark(resource)}
                  />
                </div>

                <div className="sp-matcard__meta">
                  <Badge size="sm">
                    {labelFor(RESOURCE_TYPE_LABELS, resource.resource_type)}
                  </Badge>
                  <Badge tone={statusTone(resource.visibility)} size="sm">
                    {labelFor(VISIBILITY_LABELS, resource.visibility)}
                  </Badge>
                  {resource.file_size_bytes ? (
                    <span>{formatBytes(resource.file_size_bytes)}</span>
                  ) : null}
                  {resource.course_title ? <span>{resource.course_title}</span> : null}
                </div>

                <div className="sp-matcard__meta">
                  <span>Added {formatDate(resource.created_at)}</span>
                  {resource.download_count ? (
                    <span>· {formatNumber(resource.download_count)} downloads</span>
                  ) : null}
                  {resource.last_accessed_at ? (
                    <span>· opened {relativeFromNow(resource.last_accessed_at)}</span>
                  ) : null}
                </div>

                {resource.tags?.length ? (
                  <div className="sp-matcard__meta">
                    {resource.tags.map((tag) => (
                      <Badge key={tag} size="sm" tone="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="sp-matcard__foot">
                  {resource.has_file ? (
                    <Button
                      size="sm"
                      variant="primary"
                      iconLeft="download"
                      loading={downloadingId === resource.id}
                      onClick={() => open(resource)}
                    >
                      Open
                    </Button>
                  ) : resource.external_url ? (
                    <Button
                      size="sm"
                      variant="primary"
                      iconLeft="chevronRight"
                      href={resource.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Visit link
                    </Button>
                  ) : (
                    <Badge size="sm" tone="neutral">
                      No file attached
                    </Badge>
                  )}
                  {resource.is_owner_upload && resource.visibility === 'private' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft="trash"
                      onClick={() => setDeleting(resource)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <Card>
            <Pagination
              page={pager.meta.page}
              pages={pager.meta.pages}
              total={pager.meta.total}
              perPage={pager.meta.per_page}
              onPageChange={pager.setPage}
              label="materials"
            />
          </Card>
        </>
      )}

      <UploadDialog
        open={uploadOpen}
        courses={courses}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          toast.success('Upload stored privately');
          setScope('mine');
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this upload?"
        message={
          deleting
            ? `"${deleting.title}" and its stored file will be removed permanently.`
            : ''
        }
        confirmLabel="Delete upload"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/* --- Private upload ----------------------------------------------------- */

function UploadDialog({ open, courses, onClose, onUploaded }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    resource_type: 'note',
    course_id: '',
    tags: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [localError, setLocalError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setForm({
      title: '',
      description: '',
      resource_type: 'note',
      course_id: '',
      tags: '',
    });
    setFieldErrors({});
    setLocalError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  const allowedForType =
    TYPE_EXTENSIONS[form.resource_type] || ALLOWED_EXTENSIONS;

  /** Same rules the server enforces, checked before the request is sent. */
  function validateFile(candidate) {
    if (!candidate) return 'Attach a file to upload.';
    const ext = extensionOf(candidate.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${ext || 'unknown'}" files are not accepted. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
    }
    if (!allowedForType.includes(ext)) {
      return `A "${labelFor(RESOURCE_TYPE_LABELS, form.resource_type)}" must be one of: ${allowedForType.join(', ')}.`;
    }
    if (candidate.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return `The file is ${formatBytes(candidate.size)}; the limit is ${MAX_UPLOAD_MB} MB.`;
    }
    return null;
  }

  function onFileChange(event) {
    const candidate = event.target.files?.[0] || null;
    setFile(candidate);
    setLocalError(validateFile(candidate));
    if (candidate && !form.title) {
      setForm((current) => ({
        ...current,
        title: candidate.name.replace(/\.[^.]+$/, '').slice(0, 250),
      }));
    }
  }

  async function submit(event) {
    event.preventDefault();
    const problem = validateFile(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setBusy(true);
    setFieldErrors({});
    setLocalError(null);
    try {
      await materialsApi.upload(file, {
        title: form.title.trim(),
        description: form.description.trim(),
        resource_type: form.resource_type,
        course_id: form.course_id,
        tags: form.tags.trim(),
      });
      onUploaded?.();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      // Surface the backend's own message verbatim: it explains exactly which
      // extension / size / type rule rejected the file.
      setLocalError(caught.fields?.file || caught.message);
      if (!caught.fields?.file) {
        toast.apiError(caught, 'Upload rejected');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Upload a private note"
      description="Your uploads stay private to your account and are never served from a public URL."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="sp-upload-form" loading={busy}>
            Upload
          </Button>
        </>
      }
    >
      <form id="sp-upload-form" className="sp-stack" onSubmit={submit} noValidate>
        <div className="sp-mat__file">
          <label htmlFor="sp-upload-file">
            <strong>File</strong>
          </label>
          <input
            id="sp-upload-file"
            ref={fileRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
            onChange={onFileChange}
            aria-describedby="sp-upload-hint"
          />
          <p className="sp-mat__hint" id="sp-upload-hint">
            Allowed for {labelFor(RESOURCE_TYPE_LABELS, form.resource_type)}:{' '}
            {allowedForType.join(', ')} · maximum {MAX_UPLOAD_MB} MB.
            {file ? ` Selected: ${file.name} (${formatBytes(file.size)}).` : ''}
          </p>
          {localError ? (
            <p className="sp-mat__error" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <Input
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
          maxLength={250}
        />
        <div className="sp-mat__upload">
          <Select
            label="Resource type"
            options={UPLOAD_TYPE_OPTIONS}
            value={form.resource_type}
            error={fieldErrors.resource_type}
            onChange={(event) => {
              const next = event.target.value;
              setForm((current) => ({ ...current, resource_type: next }));
              setLocalError(null);
            }}
          />
          <Select
            label="Course"
            placeholder="No course"
            options={courses}
            value={form.course_id}
            error={fieldErrors.course_id}
            onChange={(event) =>
              setForm((current) => ({ ...current, course_id: event.target.value }))
            }
          />
        </div>
        <Textarea
          label="Description"
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
        <Input
          label="Tags"
          value={form.tags}
          error={fieldErrors.tags}
          hint="Comma separated, used by search"
          onChange={(event) =>
            setForm((current) => ({ ...current, tags: event.target.value }))
          }
          placeholder="polity, revision, formulas"
        />
      </form>
    </Dialog>
  );
}
