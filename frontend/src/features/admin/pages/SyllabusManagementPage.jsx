import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import MetricTile from '../../../components/ui/MetricTile';
import Select from '../../../components/ui/Select';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatMinutes, formatNumber } from '../../../utils/format';
import { statusTone } from '../../../utils/constants';
import SyllabusImportDialog from '../components/SyllabusImportDialog';
import SyllabusItemDialog from '../components/SyllabusItemDialog';
import SyllabusTreeEditor from '../components/SyllabusTreeEditor';
import '../admin.css';

/**
 * Syllabus management (PRD 4.6).
 *
 * Reads `GET /api/v1/admin/syllabus?course_id=&version_id=` and mutates through
 * `POST /admin/syllabus`, `PATCH /admin/syllabus/:id`,
 * `DELETE /admin/syllabus/:id?kind=&force=`, `PATCH /admin/syllabus/reorder`,
 * `POST /admin/syllabus/versions`, `POST /admin/syllabus/versions/:id/publish`,
 * `POST /admin/syllabus/versions/:id/migrate-progress`,
 * `GET /admin/syllabus/versions/:id/impact`, `POST /admin/syllabus/import` and
 * `GET /admin/syllabus/preview`.
 *
 * Versioning is surfaced on the page rather than hidden: the status of the
 * selected version, what publishing does to student progress, and the exact
 * number of progress rows carried forward are all shown.
 */
export default function SyllabusManagementPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const courseId = params.get('course_id') || '';
  const versionId = params.get('version_id') || '';

  const [courses, setCourses] = useState([]);
  const [itemTarget, setItemTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [forceTarget, setForceTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [versionNotes, setVersionNotes] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.courses
      .list({ per_page: 100, sort: 'title' })
      .then((payload) => {
        const items = payload.items || [];
        setCourses(
          items.map((course) => ({
            value: String(course.id),
            label: `${course.title} (${course.status})`,
          })),
        );
        if (!courseId && items.length) {
          setParams({ course_id: String(items[0].id) }, { replace: true });
        }
      })
      .catch(() => setCourses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTree = useCallback(() => {
    if (!courseId) return Promise.resolve(null);
    return adminApi.syllabus.tree({
      course_id: courseId,
      version_id: versionId || undefined,
    });
  }, [courseId, versionId]);

  // `fetchTree` changes whenever the course or version changes, so useApi
  // refetches on its own; no extra effect is needed here.
  const { data, error, loading, reload } = useApi(fetchTree, {
    immediate: Boolean(courseId),
  });

  const version = data?.version;
  const versions = data?.versions || [];
  const editable = version ? version.status !== 'archived' : false;

  /** Subjects already linked to the course, for the unit/chapter forms. */
  const [subjectOptions, setSubjectOptions] = useState([]);
  useEffect(() => {
    if (!courseId) {
      setSubjectOptions([]);
      return;
    }
    adminApi.courses
      .listSubjects(courseId)
      .then((payload) =>
        setSubjectOptions(
          (payload.items || []).map((subject) => ({
            value: String(subject.id),
            label: subject.name,
          })),
        ),
      )
      .catch(() => setSubjectOptions([]));
  }, [courseId]);

  const versionOptions = useMemo(
    () =>
      versions.map((row) => ({
        value: String(row.id),
        label: `Version ${row.version_number} — ${row.status}`,
      })),
    [versions],
  );

  function selectCourse(nextCourseId) {
    setParams(nextCourseId ? { course_id: nextCourseId } : {});
  }

  function selectVersion(nextVersionId) {
    setParams({ course_id: courseId, version_id: nextVersionId });
  }

  async function reorder(kind, items) {
    try {
      await adminApi.syllabus.reorder(kind, items);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not save the new order');
      await reload();
    }
  }

  async function removeItem(force = false) {
    const target = force ? forceTarget : deleteTarget;
    if (!target) return;
    setBusy(true);
    try {
      await adminApi.syllabus.deleteItem(target.item.id, {
        kind: target.kind,
        force,
      });
      toast.success(`${target.kind} deleted`);
      setDeleteTarget(null);
      setForceTarget(null);
      await reload();
    } catch (caught) {
      if (caught.extra?.requires_force) {
        setDeleteTarget(null);
        setForceTarget({ ...target, impact: caught.extra.impact, message: caught.message });
      } else {
        toast.apiError(caught, 'Could not delete the item');
      }
    } finally {
      setBusy(false);
    }
  }

  async function createVersion() {
    setBusy(true);
    try {
      const result = await adminApi.syllabus.createVersion({
        course_id: Number(courseId),
        notes: versionNotes.trim() || undefined,
        clone: true,
      });
      toast.success(
        `Draft version ${result.version.version_number} created`,
        result.message,
      );
      setNewVersionOpen(false);
      setVersionNotes('');
      selectVersion(String(result.version.id));
    } catch (caught) {
      toast.apiError(caught, 'Could not create a draft version');
    } finally {
      setBusy(false);
    }
  }

  async function publishVersion() {
    setBusy(true);
    try {
      const result = await adminApi.syllabus.publishVersion(version.id);
      const report = result.publication;
      toast.success(
        `Version ${report.version_number} published`,
        `${formatNumber(report.migrated_progress_rows)} progress row(s) carried forward; previous version(s) archived.`,
      );
      setPublishOpen(false);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not publish this version');
    } finally {
      setBusy(false);
    }
  }

  async function archiveVersion() {
    setBusy(true);
    try {
      await adminApi.syllabus.updateVersion(version.id, { status: 'archived' });
      toast.success('Version archived', 'Its topics and student progress remain stored.');
      setArchiveOpen(false);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not archive this version');
    } finally {
      setBusy(false);
    }
  }

  async function rerunMigration() {
    setBusy(true);
    try {
      const result = await adminApi.syllabus.migrateProgress(version.id);
      toast.success(
        `${formatNumber(result.created_progress_rows)} progress row(s) created`,
        result.message,
      );
    } catch (caught) {
      toast.apiError(caught, 'Could not re-run the migration');
    } finally {
      setBusy(false);
    }
  }

  async function loadImpact() {
    try {
      const result = await adminApi.syllabus.versionImpact(version.id);
      setImpact(result);
    } catch (caught) {
      toast.apiError(caught, 'Could not load the impact report');
    }
  }

  return (
    <div className="sp-page">
      <PageHeader
        title="Syllabus Management"
        description="Build units, chapters and topics per version. Publishing a draft copies student progress forward."
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft="upload"
              disabled={!version || !editable}
              onClick={() => setImportOpen(true)}
            >
              Import CSV
            </Button>
            <Button
              variant="secondary"
              iconLeft="book"
              disabled={!version}
              onClick={() => setPreviewOpen(true)}
            >
              Student preview
            </Button>
            <Button
              variant="primary"
              iconLeft="plus"
              disabled={!courseId}
              onClick={() => setNewVersionOpen(true)}
            >
              New draft version
            </Button>
          </>
        }
      />

      <Card title="Select a syllabus">
        <div className="sp-adm__filters">
          <Select
            label="Course"
            placeholder="Choose a course"
            options={courses}
            value={courseId}
            onChange={(event) => selectCourse(event.target.value)}
          />
          <Select
            label="Version"
            placeholder={versionOptions.length ? 'Latest' : 'No versions yet'}
            options={versionOptions}
            value={versionId}
            disabled={!versionOptions.length}
            onChange={(event) => selectVersion(event.target.value)}
            hint={
              version
                ? `Showing version ${version.version_number} (${version.status}).`
                : undefined
            }
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button variant="secondary" iconLeft="refresh" onClick={() => reload()}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {!courseId ? (
        <Card>
          <EmptyState
            icon="syllabus"
            title="Pick a course to edit its syllabus"
            description="Each course keeps its own numbered syllabus versions."
            compact
          />
        </Card>
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={reload}
          boxed
          action={
            error.status === 404 ? (
              <Button variant="primary" onClick={() => setNewVersionOpen(true)}>
                Create the first version
              </Button>
            ) : null
          }
        />
      ) : loading && !data ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={8} />
        </>
      ) : data ? (
        <>
          <div className="sp-adm__metrics">
            <MetricTile
              label="Version"
              value={`v${version.version_number}`}
              sub={
                version.published_at
                  ? `Published ${formatDate(version.published_at)}`
                  : `Created ${formatDate(version.created_at)}`
              }
              icon="syllabus"
            />
            <MetricTile
              label="Units / chapters"
              value={`${formatNumber(data.totals.units)} / ${formatNumber(
                data.totals.chapters,
              )}`}
              sub={`${formatNumber(data.subjects?.length || 0)} subjects`}
              icon="layers"
            />
            <MetricTile
              label="Topics"
              value={formatNumber(data.totals.topics)}
              sub={`${formatMinutes(data.totals.estimated_minutes)} estimated`}
              icon="check"
            />
            <MetricTile
              label="Student progress rows"
              value={formatNumber(data.student_impact?.progress_rows)}
              sub={`${formatNumber(data.student_impact?.students)} students affected`}
              icon="users"
              tone={data.student_impact?.progress_rows ? 'warning' : 'neutral'}
            />
          </div>

          <Card
            title="Version lifecycle"
            subtitle="Draft → published → archived. Student progress is never reset."
            actions={
              <Badge tone={statusTone(version.status)} dot>
                {version.status}
              </Badge>
            }
          >
            <p className="sp-adm__note">
              <strong>How progress survives a revision.</strong> Students read the{' '}
              <em>published</em> version. Creating a draft clones the published tree
              and records each new topic's origin, so publishing the draft copies
              every existing <code>topic_progress</code> row onto the matching new
              topic and archives the previous version with its topics intact. Nothing
              is reset, and the migration is idempotent — re-running it only fills in
              rows that are missing.
            </p>

            {version.notes ? (
              <p className="sp-adm__previewbody" style={{ marginTop: 'var(--sp-3)' }}>
                {version.notes}
              </p>
            ) : null}

            <div className="sp-adm__filteractions" style={{ marginTop: 'var(--sp-4)' }}>
              {version.status === 'draft' ? (
                <Button
                  variant="primary"
                  iconLeft="check"
                  onClick={() => setPublishOpen(true)}
                >
                  Publish version {version.version_number}
                </Button>
              ) : null}
              {version.status === 'published' ? (
                <Button
                  variant="secondary"
                  iconLeft="refresh"
                  loading={busy}
                  onClick={rerunMigration}
                >
                  Re-run progress migration
                </Button>
              ) : null}
              {version.status === 'archived' ? (
                <Badge tone="neutral">
                  Archived versions are read only — create a new draft to make changes
                </Badge>
              ) : null}
              {version.status === 'published' ? (
                <Button
                  variant="danger"
                  className="sp-adm__dangerbtn"
                  onClick={() => setArchiveOpen(true)}
                >
                  Archive version
                </Button>
              ) : null}
              <Button variant="ghost" onClick={loadImpact}>
                View impact report
              </Button>
            </div>

            {impact ? (
              <dl className="sp-adm__dl" style={{ marginTop: 'var(--sp-4)' }}>
                <div>
                  <span className="sp-adm__dt">Enrollments on this course</span>
                  <dd className="sp-adm__dd">{formatNumber(impact.enrollments)}</dd>
                </div>
                <div>
                  <span className="sp-adm__dt">Topics in this version</span>
                  <dd className="sp-adm__dd">{formatNumber(impact.progress.topics)}</dd>
                </div>
                <div>
                  <span className="sp-adm__dt">Progress rows</span>
                  <dd className="sp-adm__dd">
                    {formatNumber(impact.progress.progress_rows)}
                  </dd>
                </div>
                <div>
                  <span className="sp-adm__dt">Students with records</span>
                  <dd className="sp-adm__dd">{formatNumber(impact.progress.students)}</dd>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="sp-adm__dt">Guidance</span>
                  <dd className="sp-adm__dd">{impact.guidance}</dd>
                </div>
              </dl>
            ) : null}
          </Card>

          <Card
            title="Structure"
            subtitle={
              editable
                ? 'Add, edit, reorder or delete units, chapters and topics'
                : 'Read only — this version is archived'
            }
            actions={
              editable ? (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft="plus"
                  disabled={!subjectOptions.length}
                  onClick={() => setItemTarget({ mode: 'create', kind: 'unit' })}
                >
                  Add unit
                </Button>
              ) : null
            }
          >
            {subjectOptions.length === 0 ? (
              <EmptyState
                icon="layers"
                title="This course has no subjects linked"
                description="Link at least one subject to the course before adding units."
                compact
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    to={`/admin/courses/${courseId}`}
                  >
                    Open course editor
                  </Button>
                }
              />
            ) : (
              <SyllabusTreeEditor
                tree={data}
                editable={editable}
                onCreate={setItemTarget}
                onEdit={setItemTarget}
                onDelete={setDeleteTarget}
                onReorder={reorder}
              />
            )}
          </Card>

          <Card title="All versions of this course">
            <ul className="sp-adm__list">
              {versions.map((row) => (
                <li key={row.id}>
                  <span className="sp-adm__primary">
                    <span className="sp-adm__itemtitle">Version {row.version_number}</span>
                    <span className="sp-adm__itemmeta">
                      Created {formatDateTime(row.created_at)}
                      {row.published_at
                        ? ` · published ${formatDateTime(row.published_at)}`
                        : ''}
                      {row.cloned_from_version_id
                        ? ` · cloned from v${row.cloned_from_version_id}`
                        : ''}
                    </span>
                  </span>
                  <span className="sp-adm__chips">
                    <Badge tone={statusTone(row.status)} size="sm">
                      {row.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant={String(row.id) === String(version.id) ? 'primary' : 'ghost'}
                      onClick={() => selectVersion(String(row.id))}
                    >
                      {String(row.id) === String(version.id) ? 'Viewing' : 'Open'}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <SyllabusItemDialog
        open={Boolean(itemTarget)}
        target={itemTarget}
        versionId={version?.id}
        subjects={subjectOptions}
        onClose={() => setItemTarget(null)}
        onSaved={() => {
          setItemTarget(null);
          reload();
        }}
      />

      <SyllabusImportDialog
        open={importOpen}
        version={version}
        onClose={() => setImportOpen(false)}
        onImported={reload}
      />

      <PreviewDialog
        open={previewOpen}
        courseId={courseId}
        versionId={version?.id}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        open={newVersionOpen}
        title="Create a new draft version?"
        message="The published syllabus is cloned into a new draft. Students keep reading the published version until you publish this draft."
        details={
          <Textarea
            label="Revision notes"
            rows={2}
            maxLength={2000}
            value={versionNotes}
            placeholder="What is changing in this revision?"
            onChange={(event) => setVersionNotes(event.target.value)}
          />
        }
        confirmLabel="Create draft"
        tone="primary"
        loading={busy}
        onConfirm={createVersion}
        onClose={() => setNewVersionOpen(false)}
      />

      <ConfirmDialog
        open={publishOpen}
        title={`Publish version ${version?.version_number}?`}
        message={`This version becomes the one students read. Existing progress rows are copied forward onto the matching topics and the previously published version is archived with its topics intact. ${formatNumber(
          data?.totals?.topics,
        )} topic(s) will go live.`}
        confirmLabel="Publish version"
        tone="primary"
        loading={busy}
        onConfirm={publishVersion}
        onClose={() => setPublishOpen(false)}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={`Archive version ${version?.version_number}?`}
        message="Archived versions become read only. Their topics and every student progress record are kept, but students will have no published syllabus for this course until another version is published."
        confirmLabel="Archive version"
        tone="danger"
        loading={busy}
        onConfirm={archiveVersion}
        onClose={() => setArchiveOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete this ${deleteTarget?.kind}?`}
        message={
          deleteTarget
            ? `"${deleteTarget.item.title}" will be removed from version ${version?.version_number}.${
                deleteTarget.kind === 'topic'
                  ? ''
                  : ' Its chapters and topics are removed with it.'
              } If any student has progress on it, the request is refused and you will be asked to confirm again.`
            : ''
        }
        confirmLabel="Delete"
        loading={busy}
        onConfirm={() => removeItem(false)}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(forceTarget)}
        title="Students have progress on this item"
        message={forceTarget?.message}
        details={
          forceTarget?.impact ? (
            <dl className="sp-adm__dl">
              <div>
                <span className="sp-adm__dt">Topics affected</span>
                <dd className="sp-adm__dd">{formatNumber(forceTarget.impact.topics)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Progress rows deleted</span>
                <dd className="sp-adm__dd">
                  {formatNumber(forceTarget.impact.progress_rows)}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Students affected</span>
                <dd className="sp-adm__dd">
                  {formatNumber(forceTarget.impact.students)}
                </dd>
              </div>
            </dl>
          ) : null
        }
        confirmLabel="Delete and discard progress"
        tone="danger"
        loading={busy}
        onConfirm={() => removeItem(true)}
        onClose={() => setForceTarget(null)}
      />
    </div>
  );
}

/* --- student-facing preview -------------------------------------------- */

/** `GET /admin/syllabus/preview` returns exactly what a student would read. */
function PreviewDialog({ open, courseId, versionId, onClose }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setFailed(null);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(null);
    adminApi.syllabus
      .preview({ course_id: courseId, version_id: versionId })
      .then((payload) => {
        if (active) setPreview(payload);
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
  }, [open, courseId, versionId]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Student preview"
      description="The same structure a student sees, with no individual progress data."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <p className="sp-muted">Loading preview…</p>
      ) : failed ? (
        <p className="sp-adm__error">{failed.message}</p>
      ) : preview ? (
        <div className="sp-stack">
          <dl className="sp-adm__dl">
            <div>
              <span className="sp-adm__dt">Course</span>
              <dd className="sp-adm__dd">{preview.course?.title}</dd>
            </div>
            <div>
              <span className="sp-adm__dt">Version</span>
              <dd className="sp-adm__dd">
                v{preview.version?.version_number} ({preview.version?.status})
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Topics</span>
              <dd className="sp-adm__dd">
                {formatNumber(preview.totals?.total_topics)}
              </dd>
            </div>
          </dl>

          {(preview.subjects || []).map((subject) => (
            <Card key={subject.id} title={subject.name}>
              <ul className="sp-adm__list">
                {(subject.units || []).map((unit) => (
                  <li key={unit.id}>
                    <span className="sp-adm__primary">
                      <span className="sp-adm__itemtitle">{unit.title}</span>
                      <span className="sp-adm__itemmeta">
                        {formatNumber(
                          (unit.topics?.length || 0) +
                            (unit.children || []).reduce(
                              (sum, child) => sum + (child.topics?.length || 0),
                              0,
                            ),
                        )}{' '}
                        topics
                      </span>
                    </span>
                    <Badge tone="neutral" size="sm">
                      {unit.unit_type}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
    </Dialog>
  );
}
