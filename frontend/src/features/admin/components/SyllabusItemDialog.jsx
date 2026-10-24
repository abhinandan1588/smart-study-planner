import { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import Dialog from '../../../components/ui/Dialog';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { adminApi } from '../../../services/adminApi';
import { DIFFICULTY_OPTIONS, PRIORITY_OPTIONS } from '../../../utils/constants';
import '../admin.css';

const KIND_LABELS = {
  unit: 'unit',
  chapter: 'chapter',
  topic: 'topic',
};

/**
 * Create or edit one syllabus node (PRD 4.6).
 *
 * `POST /api/v1/admin/syllabus` with `{kind: 'unit'|'chapter'|'topic', …}` and
 * `PATCH /admin/syllabus/:id` with the same `kind`. Metadata edits never touch
 * `topic_progress`; the API confirms that with `progress_preserved: true`.
 *
 * `target` describes what to work on:
 *   { mode: 'create', kind, subjectId?, parentId?, unitId? }
 *   { mode: 'edit', kind, item }
 */
export default function SyllabusItemDialog({
  open,
  target,
  versionId,
  subjects = [],
  onClose,
  onSaved,
}) {
  const toast = useToast();
  const kind = target?.kind || 'unit';
  const isTopic = kind === 'topic';
  const editing = target?.mode === 'edit';

  const [form, setForm] = useState({
    title: '',
    description: '',
    subject_id: '',
    estimated_minutes: '60',
    difficulty: 'medium',
    importance: 'medium',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    const item = target.item || {};
    setForm({
      title: item.title || '',
      description: item.description || '',
      subject_id: String(item.subject_id || target.subjectId || subjects[0]?.value || ''),
      estimated_minutes: String(item.estimated_minutes ?? 60),
      difficulty: item.difficulty || 'medium',
      importance: item.importance || 'medium',
    });
    setFieldErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      if (editing) {
        const payload = isTopic
          ? {
              kind: 'topic',
              title: form.title.trim(),
              description: form.description.trim(),
              estimated_minutes: Number(form.estimated_minutes),
              difficulty: form.difficulty,
              importance: form.importance,
            }
          : {
              kind,
              title: form.title.trim(),
              description: form.description.trim(),
              subject_id: Number(form.subject_id),
            };
        await adminApi.syllabus.updateItem(target.item.id, payload);
        toast.success(`${KIND_LABELS[kind]} updated`, 'Student progress is preserved.');
      } else {
        const payload = isTopic
          ? {
              kind: 'topic',
              unit_id: target.unitId,
              title: form.title.trim(),
              description: form.description.trim(),
              estimated_minutes: Number(form.estimated_minutes),
              difficulty: form.difficulty,
              importance: form.importance,
            }
          : {
              kind,
              syllabus_version_id: versionId,
              subject_id: Number(form.subject_id),
              parent_id: target.parentId || undefined,
              title: form.title.trim(),
              description: form.description.trim(),
              unit_type: kind === 'chapter' ? 'chapter' : 'unit',
            };
        await adminApi.syllabus.createItem(payload);
        toast.success(`${KIND_LABELS[kind]} created`);
      }
      onSaved?.();
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields) setFormError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${editing ? 'Edit' : 'New'} ${KIND_LABELS[kind]}`}
      description={
        isTopic
          ? 'Topics carry the estimated study time, difficulty and importance students see.'
          : kind === 'chapter'
            ? 'Chapters group topics inside a unit.'
            : 'Units are the top level of a subject in this syllabus version.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="sp-syl-item-form" loading={busy}>
            {editing ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="sp-syl-item-form" className="sp-stack" onSubmit={submit} noValidate>
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
          label="Description"
          rows={3}
          value={form.description}
          error={fieldErrors.description}
          maxLength={4000}
          onChange={(event) => set('description', event.target.value)}
        />

        {isTopic ? (
          <div className="sp-adm__filters">
            <Input
              label="Estimated minutes"
              type="number"
              min="1"
              max="10000"
              required
              value={form.estimated_minutes}
              error={fieldErrors.estimated_minutes}
              onChange={(event) => set('estimated_minutes', event.target.value)}
            />
            <Select
              label="Difficulty"
              options={DIFFICULTY_OPTIONS}
              value={form.difficulty}
              error={fieldErrors.difficulty}
              onChange={(event) => set('difficulty', event.target.value)}
            />
            <Select
              label="Importance"
              options={PRIORITY_OPTIONS}
              value={form.importance}
              error={fieldErrors.importance}
              onChange={(event) => set('importance', event.target.value)}
            />
          </div>
        ) : (
          <Select
            label="Subject"
            required
            placeholder="Choose a subject"
            options={subjects}
            value={form.subject_id}
            error={fieldErrors.subject_id}
            hint="Subjects come from the course's linked subject list."
            onChange={(event) => set('subject_id', event.target.value)}
          />
        )}
      </form>
    </Dialog>
  );
}
