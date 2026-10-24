import { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import Drawer from '../../../components/ui/Drawer';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { adminApi } from '../../../services/adminApi';
import {
  COURSE_CATEGORY_OPTIONS,
  COURSE_STATUS_OPTIONS,
} from '../../../utils/constants';
import '../admin.css';

const EMPTY = {
  title: '',
  slug: '',
  description: '',
  category: 'competitive_exam',
  level: '',
  thumbnail_url: '',
  estimated_duration_weeks: '',
  target_audience: '',
  status: 'draft',
};

function toForm(course) {
  if (!course) return { ...EMPTY };
  return {
    title: course.title || '',
    slug: course.slug || '',
    description: course.description || '',
    category: course.category || 'competitive_exam',
    level: course.level || '',
    thumbnail_url: course.thumbnail_url || '',
    estimated_duration_weeks:
      course.estimated_duration_weeks === null ||
      course.estimated_duration_weeks === undefined
        ? ''
        : String(course.estimated_duration_weeks),
    target_audience: course.target_audience || '',
    status: course.status || 'draft',
  };
}

/**
 * Create / edit a course (PRD 4.4).
 *
 * `POST /api/v1/admin/courses` and `PATCH /api/v1/admin/courses/:id`. The slug
 * is left blank on create so the backend derives a unique one from the title;
 * an explicit duplicate is reported as a 409 and shown on the field.
 */
export default function CourseFormDrawer({ open, course, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(course));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(course));
    setFieldErrors({});
    setFormError(null);
  }, [open, course]);

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
      description: form.description.trim(),
      category: form.category,
      level: form.level.trim(),
      thumbnail_url: form.thumbnail_url.trim(),
      estimated_duration_weeks: form.estimated_duration_weeks
        ? Number(form.estimated_duration_weeks)
        : null,
      target_audience: form.target_audience.trim(),
    };
    if (form.slug.trim()) payload.slug = form.slug.trim();
    if (!course) payload.status = form.status;

    try {
      const result = course
        ? await adminApi.courses.update(course.id, payload)
        : await adminApi.courses.create(payload);
      toast.success(course ? 'Course updated' : 'Course created', result.course?.title);
      onSaved?.(result.course);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      setFormError(caught.fields ? null : caught.message);
      if (caught.code === 'CONFLICT') {
        setFieldErrors((current) => ({ ...current, slug: caught.message }));
        setFormError(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title={course ? 'Edit course' : 'New course'}
      description={
        course
          ? 'Changes are audited. Use the lifecycle actions to publish or archive.'
          : 'New courses start as drafts unless you choose another status.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="sp-course-form"
            loading={busy}
          >
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </>
      }
    >
      <form id="sp-course-form" className="sp-stack" onSubmit={submit} noValidate>
        {formError ? (
          <p className="sp-adm__error" role="alert">
            {formError}
          </p>
        ) : null}

        <Input
          label="Course title"
          required
          value={form.title}
          error={fieldErrors.title}
          maxLength={200}
          onChange={(event) => set('title', event.target.value)}
          placeholder="UPSC Civil Services — Prelims"
        />
        <Input
          label="Slug"
          value={form.slug}
          error={fieldErrors.slug}
          maxLength={220}
          hint={
            course
              ? 'Must stay unique across courses.'
              : 'Leave blank to derive a unique slug from the title.'
          }
          onChange={(event) => set('slug', event.target.value)}
        />
        <Textarea
          label="Description"
          rows={4}
          value={form.description}
          error={fieldErrors.description}
          maxLength={5000}
          onChange={(event) => set('description', event.target.value)}
        />
        <div className="sp-adm__filters">
          <Select
            label="Category"
            required
            options={COURSE_CATEGORY_OPTIONS}
            value={form.category}
            error={fieldErrors.category}
            onChange={(event) => set('category', event.target.value)}
          />
          <Input
            label="Level"
            value={form.level}
            error={fieldErrors.level}
            maxLength={50}
            placeholder="Beginner, Advanced…"
            onChange={(event) => set('level', event.target.value)}
          />
          <Input
            label="Duration (weeks)"
            type="number"
            min="1"
            max="520"
            value={form.estimated_duration_weeks}
            error={fieldErrors.estimated_duration_weeks}
            onChange={(event) => set('estimated_duration_weeks', event.target.value)}
          />
          {course ? null : (
            <Select
              label="Initial status"
              options={COURSE_STATUS_OPTIONS}
              value={form.status}
              error={fieldErrors.status}
              onChange={(event) => set('status', event.target.value)}
            />
          )}
        </div>
        <Input
          label="Target audience"
          value={form.target_audience}
          error={fieldErrors.target_audience}
          maxLength={300}
          placeholder="First-time aspirants preparing for the 2027 cycle"
          onChange={(event) => set('target_audience', event.target.value)}
        />
        <Input
          label="Thumbnail URL"
          type="url"
          value={form.thumbnail_url}
          error={fieldErrors.thumbnail_url}
          maxLength={500}
          onChange={(event) => set('thumbnail_url', event.target.value)}
        />
      </form>
    </Drawer>
  );
}
