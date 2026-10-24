import { useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Checkbox from '../../../components/ui/Checkbox';
import DateInput from '../../../components/ui/DateInput';
import Drawer from '../../../components/ui/Drawer';
import Input from '../../../components/ui/Input';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { syllabusApi } from '../../../services/syllabusApi';
import { toDateInput } from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import {
  DIFFICULTY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  TOPIC_STATUS_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import '../pages/syllabus.css';

/**
 * Per-topic editor: status, recorded time, notes, priority, target date and the
 * revision schedule. Everything is written through
 * `PATCH /api/v1/student/topics/:id/progress`, which answers with the stored
 * row plus recomputed unit / subject / course percentages.
 */
export default function TopicDrawer({ open, topic, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [addMinutes, setAddMinutes] = useState('');

  useEffect(() => {
    if (!open || !topic) return;
    const progress = topic.progress || {};
    setForm({
      status: progress.status || 'not_started',
      time_spent_minutes: String(progress.time_spent_minutes ?? 0),
      notes: progress.notes || '',
      priority: progress.priority || 'medium',
      target_date: toDateInput(progress.target_date),
      needs_revision: Boolean(progress.needs_revision),
      next_revision_date: toDateInput(progress.next_revision_date),
    });
    setAddMinutes('');
    setFieldErrors({});
  }, [open, topic]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function save(event) {
    event.preventDefault();
    if (!topic || !form) return;
    setSaving(true);
    setFieldErrors({});
    const payload = {
      status: form.status,
      time_spent_minutes: Number(form.time_spent_minutes) || 0,
      notes: form.notes.trim() || null,
      priority: form.priority,
      target_date: form.target_date || null,
      needs_revision: form.needs_revision,
      next_revision_date: form.next_revision_date || null,
    };
    if (addMinutes) payload.add_time_minutes = Number(addMinutes);
    try {
      const result = await syllabusApi.updateTopicProgress(topic.id, payload);
      onSaved?.(topic.id, result);
      if (result.achievements_earned?.length) {
        toast.success(
          'Achievement unlocked',
          result.achievements_earned.map((item) => item.title || item.code).join(', '),
        );
      } else {
        toast.success('Topic updated', topic.title);
      }
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, 'Could not save this topic');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!topic || !form) {
    return <Drawer open={false} onClose={onClose} />;
  }

  const spent = Number(form.time_spent_minutes) || 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={topic.title}
      description={topic.description || 'Record your progress on this topic.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button variant="primary" type="submit" form="sp-topic-form" loading={saving}>
            Save progress
          </Button>
        </>
      }
    >
      <form id="sp-topic-form" className="sp-stack" onSubmit={save} noValidate>
        <div className="sp-row sp-row--wrap">
          <Badge tone={statusTone(topic.difficulty)} size="sm">
            {labelFor(DIFFICULTY_LABELS, topic.difficulty)}
          </Badge>
          <Badge tone={statusTone(topic.importance)} size="sm">
            {labelFor(PRIORITY_LABELS, topic.importance)} importance
          </Badge>
          <Badge size="sm">Estimated {formatMinutes(topic.estimated_minutes)}</Badge>
        </div>

        <ProgressBar
          value={spent}
          max={topic.estimated_minutes || 1}
          showLabel
          label={`${formatMinutes(spent)} of ${formatMinutes(topic.estimated_minutes)}`}
          tone={form.status === 'completed' ? 'success' : 'primary'}
        />

        <Select
          label="Status"
          options={TOPIC_STATUS_OPTIONS}
          value={form.status}
          error={fieldErrors.status}
          onChange={(event) => update('status', event.target.value)}
        />

        <div className="sp-grid sp-grid--2">
          <Input
            type="number"
            label="Time spent (minutes)"
            min={0}
            value={form.time_spent_minutes}
            error={fieldErrors.time_spent_minutes}
            onChange={(event) => update('time_spent_minutes', event.target.value)}
          />
          <Input
            type="number"
            label="Add minutes"
            min={1}
            max={1440}
            value={addMinutes}
            error={fieldErrors.add_time_minutes}
            hint="Added on top of the total above"
            onChange={(event) => setAddMinutes(event.target.value)}
          />
        </div>

        <div className="sp-grid sp-grid--2">
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={form.priority}
            error={fieldErrors.priority}
            onChange={(event) => update('priority', event.target.value)}
          />
          <DateInput
            label="Target date"
            value={form.target_date}
            error={fieldErrors.target_date}
            onChange={(event) => update('target_date', event.target.value)}
          />
        </div>

        <Textarea
          label="Notes and revision comments"
          rows={6}
          value={form.notes}
          error={fieldErrors.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Key formulas, mistakes to avoid, links to revisit…"
          maxLength={5000}
        />

        <Checkbox
          label="Mark for revision"
          description="Adds this topic to the revision queue and the plan generator"
          checked={form.needs_revision}
          onChange={(event) => update('needs_revision', event.target.checked)}
        />
        {form.needs_revision ? (
          <DateInput
            label="Next revision date"
            required
            value={form.next_revision_date}
            error={fieldErrors.next_revision_date}
            onChange={(event) => update('next_revision_date', event.target.value)}
            hint="Required when a topic is flagged for revision"
          />
        ) : null}
      </form>
    </Drawer>
  );
}
