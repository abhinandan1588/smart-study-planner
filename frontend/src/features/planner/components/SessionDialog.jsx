import { useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { studentApi } from '../../../services/studentApi';
import { syllabusApi } from '../../../services/syllabusApi';
import { timetableApi } from '../../../services/timetableApi';
import { formatDateTime, toDateTimeInput } from '../../../utils/date';
import { SESSION_TYPE_LABELS, optionsFrom } from '../../../utils/constants';
import '../pages/planner.css';

const TYPE_OPTIONS = optionsFrom(SESSION_TYPE_LABELS);

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly:MO,WE,FR', label: 'Mon / Wed / Fri' },
  { value: 'weekly:TU,TH', label: 'Tue / Thu' },
  { value: 'weekly:SA,SU', label: 'Weekends' },
];

function emptyForm(defaults = {}) {
  return {
    title: '',
    session_type: 'study',
    start_at: defaults.start_at || '',
    end_at: defaults.end_at || '',
    course_id: '',
    topic_id: '',
    recurrence_rule: '',
    notes: '',
  };
}

/** Flatten the syllabus tree into a topic option list for the topic select. */
function flattenTopics(tree) {
  const options = [];
  const walkUnit = (unit, subjectName) => {
    (unit.topics || []).forEach((topic) =>
      options.push({
        value: String(topic.id),
        label: `${subjectName} · ${topic.title}`,
      }),
    );
    (unit.children || []).forEach((child) => walkUnit(child, subjectName));
  };
  (tree.subjects || []).forEach((subject) =>
    (subject.units || []).forEach((unit) => walkUnit(unit, subject.name)),
  );
  return options;
}

/**
 * Create / edit a study session.
 *
 * The server detects overlaps and answers 409 `SCHEDULE_CONFLICT`; the
 * conflicting sessions are listed here and "Schedule anyway" retries with
 * `?force=true`, which is exactly what the API expects.
 */
export default function SessionDialog({ open, session, defaults, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => emptyForm(defaults));
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [conflicts, setConflicts] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConflicts(null);
    setFieldErrors({});
    if (session) {
      setForm({
        title: session.title || '',
        session_type: session.session_type || 'study',
        start_at: toDateTimeInput(session.start_at),
        end_at: toDateTimeInput(session.end_at),
        course_id: session.course_id ? String(session.course_id) : '',
        topic_id: session.topic_id ? String(session.topic_id) : '',
        recurrence_rule: session.recurrence_rule || '',
        notes: session.notes || '',
      });
    } else {
      setForm(emptyForm(defaults));
    }
  }, [open, session, defaults]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open || !form.course_id) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    syllabusApi
      .forCourse(form.course_id)
      .then((tree) => {
        if (!cancelled) setTopics(flattenTopics(tree));
      })
      .catch(() => setTopics([]));
    return () => {
      cancelled = true;
    };
  }, [open, form.course_id]);

  function update(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'course_id') next.topic_id = '';
      // Default a 1-hour window when only the start is picked.
      if (field === 'start_at' && value && !current.end_at) {
        const start = new Date(value);
        start.setHours(start.getHours() + 1);
        next.end_at = toDateTimeInput(start);
      }
      return next;
    });
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setConflicts(null);
  }

  async function save(force) {
    setSaving(true);
    setFieldErrors({});
    const payload = {
      title: form.title.trim(),
      session_type: form.session_type,
      start_at: form.start_at,
      end_at: form.end_at,
      course_id: form.course_id ? Number(form.course_id) : null,
      topic_id: form.topic_id ? Number(form.topic_id) : null,
      notes: form.notes.trim() || null,
    };
    if (!session) payload.recurrence_rule = form.recurrence_rule || null;
    try {
      const result = session
        ? await timetableApi.updateSession(session.id, payload, { force })
        : await timetableApi.createSession(payload, { force });
      setConflicts(null);
      onSaved?.(result.session, result);
    } catch (caught) {
      if (caught.status === 409 && caught.extra?.conflicts) {
        setConflicts(caught.extra.conflicts);
      } else {
        setFieldErrors(caught.fields || {});
        if (!caught.fields || Object.keys(caught.fields).length === 0) {
          toast.apiError(caught, 'Could not save the session');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={session ? 'Edit study session' : 'New study session'}
      description="Overlaps are detected by the server before anything is stored."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {conflicts ? (
            <Button variant="danger" loading={saving} onClick={() => save(true)}>
              Schedule anyway
            </Button>
          ) : (
            <Button
              variant="primary"
              type="submit"
              form="sp-session-form"
              loading={saving}
            >
              {session ? 'Save session' : 'Add session'}
            </Button>
          )}
        </>
      }
    >
      <form
        id="sp-session-form"
        className="sp-stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
      >
        {conflicts ? (
          <div className="sp-plan__alert" role="alert">
            <div>
              <strong>This slot overlaps an existing session.</strong>
              <ul style={{ marginTop: 'var(--sp-2)' }}>
                {conflicts.map((conflict) => (
                  <li key={conflict.id || `${conflict.start_at}-${conflict.title}`}>
                    {conflict.title} · {formatDateTime(conflict.start_at)}
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: 'var(--sp-2)' }}>
                Change the time, or confirm with “Schedule anyway” to keep both.
              </p>
            </div>
          </div>
        ) : null}

        <Input
          label="Title"
          required
          value={form.title}
          error={fieldErrors.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="Polity — Fundamental Rights"
          maxLength={250}
        />
        <div className="sp-grid sp-grid--2">
          <DateInput
            mode="datetime"
            label="Starts"
            required
            value={form.start_at}
            error={fieldErrors.start_at}
            onChange={(event) => update('start_at', event.target.value)}
          />
          <DateInput
            mode="datetime"
            label="Ends"
            required
            value={form.end_at}
            error={fieldErrors.end_at}
            onChange={(event) => update('end_at', event.target.value)}
          />
        </div>
        <div className="sp-grid sp-grid--2">
          <Select
            label="Session type"
            options={TYPE_OPTIONS}
            value={form.session_type}
            error={fieldErrors.session_type}
            onChange={(event) => update('session_type', event.target.value)}
          />
          {session ? (
            <div />
          ) : (
            <Select
              label="Repeat"
              options={RECURRENCE_OPTIONS}
              value={form.recurrence_rule}
              error={fieldErrors.recurrence_rule}
              onChange={(event) => update('recurrence_rule', event.target.value)}
              hint="Occurrences that would clash are skipped"
            />
          )}
        </div>
        <div className="sp-grid sp-grid--2">
          <Select
            label="Course"
            placeholder="No course"
            options={courses}
            value={form.course_id}
            error={fieldErrors.course_id}
            onChange={(event) => update('course_id', event.target.value)}
          />
          <Select
            label="Topic"
            placeholder={form.course_id ? 'No topic' : 'Pick a course first'}
            options={topics}
            value={form.topic_id}
            error={fieldErrors.topic_id}
            disabled={!form.course_id || topics.length === 0}
            onChange={(event) => update('topic_id', event.target.value)}
          />
        </div>
        <Textarea
          label="Notes"
          rows={2}
          value={form.notes}
          error={fieldErrors.notes}
          onChange={(event) => update('notes', event.target.value)}
        />
        {session?.status ? (
          <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            Current status: <Badge size="sm">{session.status.replace(/_/g, ' ')}</Badge>
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
