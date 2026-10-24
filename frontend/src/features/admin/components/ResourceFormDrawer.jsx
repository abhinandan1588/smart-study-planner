import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import Drawer from '../../../components/ui/Drawer';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { adminApi } from '../../../services/adminApi';
import { formatBytes } from '../../../utils/format';
import {
  RESOURCE_TYPE_LABELS,
  labelFor,
  optionsFrom,
} from '../../../utils/constants';
import '../admin.css';

/**
 * Upload / edit shared study material (PRD 4.7).
 *
 * `POST /api/v1/admin/resources` (multipart) and
 * `PATCH /admin/resources/:id` (JSON metadata, or multipart to replace the
 * file). The extension / type / size rules below mirror the backend's
 * `TYPE_EXTENSIONS` and `MAX_UPLOAD_MB`; the server re-validates everything and
 * its own field message is shown verbatim when it rejects a file.
 */

const TYPE_EXTENSIONS = {
  pdf: ['pdf'],
  document: ['pdf', 'doc', 'docx', 'txt', 'md'],
  image: ['png', 'jpg', 'jpeg'],
  practice_set: ['pdf', 'doc', 'docx', 'csv', 'txt', 'md'],
  revision_sheet: ['pdf', 'doc', 'docx', 'txt', 'md'],
  note: ['pdf', 'txt', 'md', 'doc', 'docx'],
};

const TYPE_OPTIONS = optionsFrom(RESOURCE_TYPE_LABELS);

/** Admin-managed material is never private: public or enrolled students only. */
const VISIBILITY_OPTIONS = [
  { value: 'enrolled_only', label: 'Enrolled students' },
  { value: 'public', label: 'Public (all students)' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

function extensionOf(name) {
  const parts = String(name || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function flattenUnits(units, depth = 0, out = []) {
  (units || []).forEach((unit) => {
    out.push({ unit, depth });
    flattenUnits(unit.children, depth + 1, out);
  });
  return out;
}

export default function ResourceFormDrawer({
  open,
  resource,
  courses,
  limits,
  onClose,
  onSaved,
}) {
  const toast = useToast();
  const fileRef = useRef(null);
  const maxMb = limits?.max_upload_mb || 20;
  const allowed = limits?.allowed_extensions || [
    'csv',
    'doc',
    'docx',
    'jpeg',
    'jpg',
    'md',
    'pdf',
    'png',
    'txt',
  ];

  const [form, setForm] = useState({
    title: '',
    description: '',
    resource_type: 'pdf',
    visibility: 'enrolled_only',
    status: 'draft',
    tags: '',
    external_url: '',
    course_id: '',
    subject_id: '',
    unit_id: '',
    topic_id: '',
  });
  const [file, setFile] = useState(null);
  const [tree, setTree] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [fileError, setFileError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: resource?.title || '',
      description: resource?.description || '',
      resource_type: resource?.resource_type || 'pdf',
      visibility: resource?.visibility === 'public' ? 'public' : 'enrolled_only',
      status: resource?.status || 'draft',
      tags: (resource?.tags || []).join(', '),
      external_url: resource?.external_url || '',
      course_id: resource?.course_id ? String(resource.course_id) : '',
      subject_id: resource?.subject_id ? String(resource.subject_id) : '',
      unit_id: resource?.unit_id ? String(resource.unit_id) : '',
      topic_id: resource?.topic_id ? String(resource.topic_id) : '',
    });
    setFile(null);
    setFieldErrors({});
    setFileError(null);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open, resource]);

  /* The course's syllabus tree supplies the subject / unit / topic options. */
  useEffect(() => {
    if (!open || !form.course_id) {
      setTree(null);
      return;
    }
    let active = true;
    adminApi.syllabus
      .tree({ course_id: form.course_id })
      .then((payload) => {
        if (active) setTree(payload);
      })
      .catch(() => {
        if (active) setTree(null);
      });
    return () => {
      active = false;
    };
  }, [open, form.course_id]);

  const subjectOptions = useMemo(
    () =>
      (tree?.subjects || []).map((subject) => ({
        value: String(subject.id),
        label: subject.name,
      })),
    [tree],
  );

  const unitOptions = useMemo(() => {
    const subject = (tree?.subjects || []).find(
      (item) => String(item.id) === form.subject_id,
    );
    if (!subject) return [];
    return flattenUnits(subject.units).map(({ unit, depth }) => ({
      value: String(unit.id),
      label: `${'— '.repeat(depth)}${unit.title}`,
    }));
  }, [tree, form.subject_id]);

  const topicOptions = useMemo(() => {
    if (!tree) return [];
    const all = [];
    (tree.subjects || []).forEach((subject) => {
      flattenUnits(subject.units).forEach(({ unit }) => {
        if (form.unit_id && String(unit.id) !== form.unit_id) return;
        if (
          !form.unit_id &&
          form.subject_id &&
          String(subject.id) !== form.subject_id
        ) {
          return;
        }
        (unit.topics || []).forEach((topic) => {
          all.push({ value: String(topic.id), label: `${unit.title} · ${topic.title}` });
        });
      });
    });
    return all;
  }, [tree, form.unit_id, form.subject_id]);

  const isLink = form.resource_type === 'link';
  const allowedForType = TYPE_EXTENSIONS[form.resource_type] || allowed;

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateFile(candidate) {
    if (!candidate) return null;
    const ext = extensionOf(candidate.name);
    if (!allowed.includes(ext)) {
      return `"${ext || 'unknown'}" files are not accepted. Allowed: ${allowed.join(', ')}.`;
    }
    if (!allowedForType.includes(ext)) {
      return `A "${labelFor(
        RESOURCE_TYPE_LABELS,
        form.resource_type,
      )}" resource accepts: ${allowedForType.join(', ')}.`;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      return `The file is ${formatBytes(candidate.size)}; the limit is ${maxMb} MB.`;
    }
    if (candidate.size === 0) return 'The file is empty.';
    return null;
  }

  function onFileChange(event) {
    const candidate = event.target.files?.[0] || null;
    setFile(candidate);
    setFileError(validateFile(candidate));
    if (candidate && !form.title) {
      set('title', candidate.name.replace(/\.[^.]+$/, '').slice(0, 250));
    }
  }

  async function submit(event) {
    event.preventDefault();
    const problem = validateFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    if (!resource && !isLink && !file && !form.external_url.trim()) {
      setFileError('Attach a file, or provide an external URL instead.');
      return;
    }
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    setFileError(null);

    const fields = {
      title: form.title.trim(),
      description: form.description.trim(),
      resource_type: form.resource_type,
      visibility: form.visibility,
      status: form.status,
      tags: form.tags.trim(),
      external_url: form.external_url.trim(),
      course_id: form.course_id,
      subject_id: form.subject_id,
      unit_id: form.unit_id,
      topic_id: form.topic_id,
    };

    try {
      const result = resource
        ? await adminApi.resources.update(resource.id, fields, file)
        : await adminApi.resources.create(fields, file);
      toast.success(
        resource ? 'Material updated' : 'Material uploaded',
        result.notified_students
          ? `${result.notified_students} student(s) notified.`
          : undefined,
      );
      onSaved?.(result.resource);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      setFileError(caught.fields?.file || null);
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
      title={resource ? 'Edit study material' : 'Upload study material'}
      description="Files are streamed through a permission-checked endpoint, never from a public URL."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="sp-resource-form" loading={busy}>
            {resource ? 'Save changes' : 'Upload material'}
          </Button>
        </>
      }
    >
      <form id="sp-resource-form" className="sp-stack" onSubmit={submit} noValidate>
        {formError ? (
          <p className="sp-adm__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="sp-adm__filters">
          <Select
            label="Resource type"
            required
            options={TYPE_OPTIONS}
            value={form.resource_type}
            error={fieldErrors.resource_type}
            onChange={(event) => {
              set('resource_type', event.target.value);
              setFileError(null);
            }}
          />
          <Select
            label="Visibility"
            options={VISIBILITY_OPTIONS}
            value={form.visibility}
            error={fieldErrors.visibility}
            onChange={(event) => set('visibility', event.target.value)}
          />
          <Select
            label="Publication status"
            options={STATUS_OPTIONS}
            value={form.status}
            error={fieldErrors.status}
            hint="Publishing notifies the targeted students"
            onChange={(event) => set('status', event.target.value)}
          />
        </div>

        {isLink ? (
          <Input
            label="External URL"
            type="url"
            required
            value={form.external_url}
            error={fieldErrors.external_url}
            maxLength={1000}
            placeholder="https://example.org/notes.pdf"
            onChange={(event) => set('external_url', event.target.value)}
          />
        ) : (
          <div className="sp-adm__filepick">
            <label htmlFor="sp-resource-file">
              <strong>{resource ? 'Replace file (optional)' : 'File'}</strong>
            </label>
            <input
              id="sp-resource-file"
              ref={fileRef}
              type="file"
              accept={allowedForType.map((ext) => `.${ext}`).join(',')}
              onChange={onFileChange}
              aria-describedby="sp-resource-file-hint"
            />
            <p className="sp-adm__itemmeta" id="sp-resource-file-hint">
              Allowed for {labelFor(RESOURCE_TYPE_LABELS, form.resource_type)}:{' '}
              {allowedForType.join(', ')} · maximum {maxMb} MB.
              {file ? ` Selected: ${file.name} (${formatBytes(file.size)}).` : ''}
              {resource?.has_file && !file
                ? ` Current file: ${formatBytes(resource.file_size_bytes)}.`
                : ''}
            </p>
            {fileError ? (
              <p className="sp-adm__error" role="alert">
                {fileError}
              </p>
            ) : null}
            <Input
              label="…or an external URL"
              type="url"
              value={form.external_url}
              error={fieldErrors.external_url}
              maxLength={1000}
              onChange={(event) => set('external_url', event.target.value)}
            />
          </div>
        )}

        <Input
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          maxLength={250}
          onChange={(event) => set('title', event.target.value)}
        />
        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          error={fieldErrors.description}
          maxLength={4000}
          onChange={(event) => set('description', event.target.value)}
        />
        <Input
          label="Tags"
          value={form.tags}
          error={fieldErrors.tags}
          maxLength={500}
          hint="Comma separated, used by search"
          placeholder="polity, revision, formulas"
          onChange={(event) => set('tags', event.target.value)}
        />

        <div>
          <span className="sp-adm__dt">Syllabus association</span>
          <div className="sp-adm__filters">
            <Select
              label="Course"
              placeholder="No course"
              options={courses}
              value={form.course_id}
              error={fieldErrors.course_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  course_id: event.target.value,
                  subject_id: '',
                  unit_id: '',
                  topic_id: '',
                }))
              }
            />
            <Select
              label="Subject"
              placeholder={subjectOptions.length ? 'No subject' : 'Pick a course first'}
              options={subjectOptions}
              value={form.subject_id}
              disabled={!subjectOptions.length}
              error={fieldErrors.subject_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subject_id: event.target.value,
                  unit_id: '',
                  topic_id: '',
                }))
              }
            />
            <Select
              label="Unit or chapter"
              placeholder={unitOptions.length ? 'No unit' : 'Pick a subject first'}
              options={unitOptions}
              value={form.unit_id}
              disabled={!unitOptions.length}
              error={fieldErrors.unit_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unit_id: event.target.value,
                  topic_id: '',
                }))
              }
            />
            <Select
              label="Topic"
              placeholder={topicOptions.length ? 'No topic' : 'Pick a unit first'}
              options={topicOptions}
              value={form.topic_id}
              disabled={!topicOptions.length}
              error={fieldErrors.topic_id}
              onChange={(event) => set('topic_id', event.target.value)}
            />
          </div>
          <p className="sp-adm__itemmeta">
            Choosing a topic fills in its unit, subject and course on the server.
          </p>
        </div>
      </form>
    </Drawer>
  );
}
