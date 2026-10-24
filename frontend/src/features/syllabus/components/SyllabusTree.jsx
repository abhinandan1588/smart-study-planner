import { useState } from 'react';
import Badge from '../../../components/ui/Badge';
import EmptyState from '../../../components/ui/EmptyState';
import Icon from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ProgressBar from '../../../components/ui/ProgressBar';
import { formatDate } from '../../../utils/date';
import { formatMinutes, formatPercent } from '../../../utils/format';
import {
  DIFFICULTY_LABELS,
  PRIORITY_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import '../pages/syllabus.css';

const STATUS_STEPS = [
  { value: 'not_started', label: 'Not started', modifier: '' },
  { value: 'in_progress', label: 'In progress', modifier: 'is-progress' },
  { value: 'completed', label: 'Completed', modifier: 'is-done' },
];

/**
 * Collapsible subject → unit → chapter → topic tree with rolled-up progress
 * bars at every level. Status changes are applied optimistically by the parent
 * and reconciled with the server's recomputed percentages.
 */
export default function SyllabusTree({
  subjects = [],
  pendingTopicId,
  onStatusChange,
  onOpenTopic,
}) {
  if (!subjects.length) {
    return (
      <EmptyState
        icon="syllabus"
        title="No topics match these filters"
        description="Clear a filter to see the whole syllabus again."
        compact
      />
    );
  }
  return (
    <div>
      {subjects.map((subject) => (
        <SubjectBlock
          key={subject.id}
          subject={subject}
          pendingTopicId={pendingTopicId}
          onStatusChange={onStatusChange}
          onOpenTopic={onOpenTopic}
        />
      ))}
    </div>
  );
}

function SubjectBlock({ subject, pendingTopicId, onStatusChange, onOpenTopic }) {
  const [open, setOpen] = useState(true);
  const stats = subject.progress || {};
  return (
    <section className="sp-syl__subject">
      <button
        type="button"
        className="sp-syl__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`sp-syl__chev ${open ? 'is-open' : ''}`}>
          <Icon name="chevronRight" size={16} />
        </span>
        <span className="sp-syl__togglebody">
          <span className="sp-syl__name">{subject.name}</span>
          <span className="sp-syl__meta">
            {stats.completed_topics || 0} of {stats.total_topics || 0} topics ·{' '}
            {formatMinutes(stats.time_spent_minutes)} recorded
            {subject.weightage ? ` · weight ${subject.weightage}` : ''}
          </span>
        </span>
        <span className="sp-syl__togglebar">
          <ProgressBar
            value={subject.progress_percent || 0}
            tone={subject.progress_percent >= 100 ? 'success' : 'primary'}
            label={`${subject.name} completion`}
            size="sm"
          />
        </span>
        <Badge size="sm" tone={subject.progress_percent >= 100 ? 'success' : 'neutral'}>
          {formatPercent(subject.progress_percent)}
        </Badge>
      </button>
      {open ? (
        <div className="sp-syl__children">
          {subject.units?.length ? (
            subject.units.map((unit) => (
              <UnitBlock
                key={unit.id}
                unit={unit}
                pendingTopicId={pendingTopicId}
                onStatusChange={onStatusChange}
                onOpenTopic={onOpenTopic}
              />
            ))
          ) : (
            <p className="sp-syl__meta" style={{ padding: 'var(--sp-3) 0' }}>
              No units published for this subject.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function UnitBlock({ unit, pendingTopicId, onStatusChange, onOpenTopic, depth = 0 }) {
  // Units and their chapters start open so the topic rows (and their status
  // controls) are reachable without drilling down first.
  const [open, setOpen] = useState(depth <= 1);
  const stats = unit.progress || {};
  return (
    <div className="sp-syl__unit">
      <button
        type="button"
        className="sp-syl__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`sp-syl__chev ${open ? 'is-open' : ''}`}>
          <Icon name="chevronRight" size={14} />
        </span>
        <span className="sp-syl__togglebody">
          <span className="sp-syl__unitname">
            {unit.unit_type === 'chapter' ? 'Chapter · ' : ''}
            {unit.title}
          </span>
          <span className="sp-syl__meta">
            {stats.completed_topics || 0}/{stats.total_topics || 0} topics ·{' '}
            {formatPercent(unit.progress_percent)}
          </span>
        </span>
        <span className="sp-syl__togglebar">
          <ProgressBar
            value={unit.progress_percent || 0}
            tone={unit.progress_percent >= 100 ? 'success' : 'primary'}
            label={`${unit.title} completion`}
            size="sm"
          />
        </span>
      </button>
      {open ? (
        <div className="sp-syl__children">
          {unit.topics?.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              pending={pendingTopicId === topic.id}
              onStatusChange={onStatusChange}
              onOpenTopic={onOpenTopic}
            />
          ))}
          {unit.children?.map((child) => (
            <UnitBlock
              key={child.id}
              unit={child}
              depth={depth + 1}
              pendingTopicId={pendingTopicId}
              onStatusChange={onStatusChange}
              onOpenTopic={onOpenTopic}
            />
          ))}
          {!unit.topics?.length && !unit.children?.length ? (
            <p className="sp-syl__meta" style={{ padding: 'var(--sp-2) 0' }}>
              No topics here match the current filters.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TopicRow({ topic, pending, onStatusChange, onOpenTopic }) {
  const progress = topic.progress || {};
  const status = progress.status || 'not_started';
  return (
    <div className="sp-topic">
      <div className="sp-topic__main">
        <span className={`sp-topic__title ${status === 'completed' ? 'is-complete' : ''}`}>
          {topic.title}
        </span>
        <span className="sp-topic__tags">
          <span>{formatMinutes(topic.estimated_minutes)} est.</span>
          <span>·</span>
          <span>{labelFor(DIFFICULTY_LABELS, topic.difficulty)}</span>
          {progress.time_spent_minutes ? (
            <>
              <span>·</span>
              <span>{formatMinutes(progress.time_spent_minutes)} spent</span>
            </>
          ) : null}
          {progress.priority && progress.priority !== 'medium' ? (
            <Badge tone={statusTone(progress.priority)} size="sm">
              {labelFor(PRIORITY_LABELS, progress.priority)}
            </Badge>
          ) : null}
          {progress.target_date ? (
            <Badge size="sm">Target {formatDate(progress.target_date)}</Badge>
          ) : null}
          {progress.needs_revision ? (
            <Badge tone="warning" size="sm">
              Revise {progress.next_revision_date ? formatDate(progress.next_revision_date) : ''}
            </Badge>
          ) : null}
          {progress.notes ? (
            <Badge tone="info" size="sm">
              Notes
            </Badge>
          ) : null}
        </span>
      </div>

      <div
        className="sp-statusgroup"
        role="group"
        aria-label={`Status for ${topic.title}`}
      >
        {STATUS_STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            className={`sp-statusgroup__btn ${step.modifier}`}
            aria-pressed={status === step.value}
            disabled={pending}
            onClick={() => onStatusChange(topic, step.value)}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="sp-topic__aside">
        <IconButton
          icon="edit"
          size="sm"
          label={`Open details for ${topic.title}`}
          onClick={() => onOpenTopic(topic)}
        />
      </div>
    </div>
  );
}
