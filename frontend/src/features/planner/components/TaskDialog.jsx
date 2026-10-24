import { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { studentApi } from '../../../services/studentApi';
import { tasksApi } from '../../../services/tasksApi';
import {
  PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../../../utils/constants';
import { toDateInput, toDateTimeInput } from '../../../utils/date';

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly:MO,WE,FR', label: 'Mon / Wed / Fri' },
  { value: 'weekly:SA,SU', label: 'Weekends' },
];

function emptyForm() {
  return {
    title: '',
    description: '',
    priority: 'medium',
    status: 'pending',
    due_date: '',
    due_time: '',
    estimated_minutes: '',
    course_id: '',
    reminder_at: '',
    recurrence_rule: '',
  };
}

function formFromTask(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'medium',
    status: task.status || 'pending',
    due_date: toDateInput(task.due_date),
    due_time: (task.due_time || '').slice(0, 5),
    estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : '',
    course_id: task.course_id ? String(task.course_id) : '',
    reminder_at: toDateTimeInput(task.reminder_at),
    recurrence_rule: task.recurrence_rule || '',
  };
}

/**
 * Create / edit a task against `POST|PATCH /api/v1/student/tasks`.
 * Field-level validation errors from the server are mapped back onto inputs.
 */
export default function TaskDialog({ open, task, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [courses, setCourses] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(task ? formFromTask(task) : emptyForm());
    setFieldErrors({});
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    studentApi
      .listEnrollments({ status: 'active' })
      .then((payload) => {
        if (cancelled) return;
        setCourses(
          (payload.items || []).map((item) => ({
            value: String(item.course_id),
            label: item.course?.title || `Course ${item.course_id}`,
          })),
        );
      })
      .catch(() => setCourses([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      estimated_minutes: form.estimated_minutes
        ? Number(form.estimated_minutes)
        : null,
      course_id: form.course_id ? Number(form.course_id) : null,
      reminder_at: form.reminder_at || null,
      recurrence_rule: form.recurrence_rule || null,
    };
    try {
      const result = task
        ? await tasksApi.update(task.id, payload)
        : await tasksApi.create(payload);
      onSaved?.(result.task);
    } catch (caught) {
      setFieldErrors(caught.fields || {});
      if (!caught.fields || Object.keys(caught.fields).length === 0) {
        toast.apiError(caught, task ? 'Could not save the task' : 'Could not create the task');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      description="Tasks carry a priority, a deadline and an optional recurrence."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" form="sp-task-form" type="submit" loading={saving}>
            {task ? 'Save task' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="sp-task-form" className="sp-stack" onSubmit={submit} noValidate>
        <Input
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="Revise Modern History unit 3"
          maxLength={250}
        />
        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="Optional detail or checklist"
        />
        <div className="sp-grid sp-grid--2">
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={form.priority}
            error={fieldErrors.priority}
            onChange={(event) => update('priority', event.target.value)}
          />
          <Select
            label="Status"
            options={TASK_STATUS_OPTIONS}
            value={form.status}
            error={fieldErrors.status}
            onChange={(event) => update('status', event.target.value)}
          />
        </div>
        <div className="sp-grid sp-grid--2">
          <DateInput
            label="Due date"
            value={form.due_date}
            error={fieldErrors.due_date}
            onChange={(event) => update('due_date', event.target.value)}
          />
          <DateInput
            mode="time"
            label="Due time"
            value={form.due_time}
            error={fieldErrors.due_time}
            onChange={(event) => update('due_time', event.target.value)}
          />
        </div>
        <div className="sp-grid sp-grid--2">
          <Input
            type="number"
            label="Estimated minutes"
            min={1}
            max={1440}
            value={form.estimated_minutes}
            error={fieldErrors.estimated_minutes}
            onChange={(event) => update('estimated_minutes', event.target.value)}
            placeholder="45"
          />
          <Select
            label="Course"
            placeholder="No course"
            options={courses}
            value={form.course_id}
            error={fieldErrors.course_id}
            onChange={(event) => update('course_id', event.target.value)}
          />
        </div>
        <div className="sp-grid sp-grid--2">
          <DateInput
            mode="datetime"
            label="Reminder"
            value={form.reminder_at}
            error={fieldErrors.reminder_at}
            onChange={(event) => update('reminder_at', event.target.value)}
            hint="Creates an in-app reminder"
          />
          <Select
            label="Repeat"
            options={RECURRENCE_OPTIONS}
            value={form.recurrence_rule}
            error={fieldErrors.recurrence_rule}
            onChange={(event) => update('recurrence_rule', event.target.value)}
            hint="The next occurrence is created when you complete this one"
          />
        </div>
      </form>
    </Dialog>
  );
}
