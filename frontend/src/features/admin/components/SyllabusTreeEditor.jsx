import { useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import Icon from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import { formatMinutes, formatNumber, pluralize } from '../../../utils/format';
import { statusTone } from '../../../utils/constants';
import '../admin.css';

/**
 * Units → chapters → topics tree editor (PRD 4.6).
 *
 * Rendering comes from `GET /api/v1/admin/syllabus`; every mutation is handed
 * back to the page, which calls `POST /admin/syllabus`,
 * `PATCH /admin/syllabus/:id`, `DELETE /admin/syllabus/:id?kind=` and
 * `PATCH /admin/syllabus/reorder`.
 *
 * Reordering is button driven (move up / move down) rather than drag only, so
 * it stays keyboard operable. Each press sends the new `display_order` for the
 * affected sibling group.
 */
export default function SyllabusTreeEditor({
  tree,
  editable = true,
  onCreate,
  onEdit,
  onDelete,
  onReorder,
}) {
  const subjects = tree?.subjects || [];

  if (!subjects.length) {
    return (
      <EmptyState
        icon="syllabus"
        title="This version has no units yet"
        description="Add a unit for one of the course's subjects, or bulk-import the structure from a CSV file."
        boxed
        action={
          editable ? (
            <Button
              size="sm"
              variant="primary"
              iconLeft="plus"
              onClick={() => onCreate({ mode: 'create', kind: 'unit' })}
            >
              Add unit
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="sp-syltree">
      {subjects.map((subject) => (
        <SubjectBlock
          key={subject.id}
          subject={subject}
          editable={editable}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}

function SubjectBlock({ subject, editable, onCreate, onEdit, onDelete, onReorder }) {
  const [open, setOpen] = useState(true);
  const units = subject.units || [];
  const topicCount = units.reduce(
    (sum, unit) => sum + countTopics(unit),
    0,
  );

  return (
    <section className="sp-syltree__subject">
      <header className="sp-syltree__subjecthead">
        <button
          type="button"
          className="sp-syltree__toggle"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${subject.name}`}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="chevronDown" size={14} />
        </button>
        <div className="sp-syltree__body">
          <span className="sp-syltree__title">{subject.name}</span>
          <span className="sp-syltree__meta">
            <span>
              {formatNumber(units.length)} {pluralize(units.length, 'unit')}
            </span>
            <span>
              {formatNumber(topicCount)} {pluralize(topicCount, 'topic')}
            </span>
            {subject.status && subject.status !== 'active' ? (
              <Badge tone={statusTone(subject.status)} size="sm">
                {subject.status}
              </Badge>
            ) : null}
          </span>
        </div>
        {editable ? (
          <div className="sp-syltree__actions">
            <Button
              size="sm"
              variant="secondary"
              iconLeft="plus"
              onClick={() =>
                onCreate({ mode: 'create', kind: 'unit', subjectId: subject.id })
              }
            >
              Unit
            </Button>
          </div>
        ) : null}
      </header>

      {open
        ? units.map((unit, index) => (
            <UnitNode
              key={unit.id}
              unit={unit}
              index={index}
              siblings={units}
              depth={0}
              editable={editable}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))
        : null}
    </section>
  );
}

function countTopics(unit) {
  return (
    (unit.topics?.length || 0) +
    (unit.children || []).reduce((sum, child) => sum + countTopics(child), 0)
  );
}

function UnitNode({
  unit,
  index,
  siblings,
  depth,
  editable,
  onCreate,
  onEdit,
  onDelete,
  onReorder,
}) {
  const [open, setOpen] = useState(true);
  const isChapter = depth > 0 || unit.unit_type === 'chapter';
  const kind = isChapter ? 'chapter' : 'unit';
  const topics = unit.topics || [];
  const children = unit.children || [];

  function moveUnit(delta) {
    const next = [...siblings];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(
      kind,
      next.map((item, position) => ({ id: item.id, display_order: position })),
    );
  }

  return (
    <>
      <div
        className={`sp-syltree__node ${
          isChapter ? 'sp-syltree__node--chapter' : ''
        }`}
      >
        <button
          type="button"
          className="sp-syltree__toggle"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${unit.title}`}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name="chevronDown" size={14} />
        </button>
        <div className="sp-syltree__body">
          <span className="sp-syltree__title">{unit.title}</span>
          <span className="sp-syltree__meta">
            <Badge tone={isChapter ? 'neutral' : 'primary'} size="sm">
              {isChapter ? 'Chapter' : 'Unit'}
            </Badge>
            <span>
              {formatNumber(topics.length)} {pluralize(topics.length, 'topic')}
            </span>
            {children.length ? (
              <span>
                {formatNumber(children.length)} {pluralize(children.length, 'chapter')}
              </span>
            ) : null}
            {unit.cloned_from_unit_id ? <span>cloned</span> : null}
          </span>
        </div>
        {editable ? (
          <div className="sp-syltree__actions">
            <IconButton
              icon="chevronDown"
              label={`Move ${unit.title} up`}
              size="sm"
              variant="outline"
              className="sp-adm__flip"
              disabled={index === 0}
              onClick={() => moveUnit(-1)}
            />
            <IconButton
              icon="chevronDown"
              label={`Move ${unit.title} down`}
              size="sm"
              variant="outline"
              disabled={index === siblings.length - 1}
              onClick={() => moveUnit(1)}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onCreate({ mode: 'create', kind: 'topic', unitId: unit.id })
              }
            >
              + Topic
            </Button>
            {isChapter ? null : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onCreate({
                    mode: 'create',
                    kind: 'chapter',
                    subjectId: unit.subject_id,
                    parentId: unit.id,
                  })
                }
              >
                + Chapter
              </Button>
            )}
            <IconButton
              icon="edit"
              label={`Edit ${unit.title}`}
              size="sm"
              onClick={() => onEdit({ mode: 'edit', kind, item: unit })}
            />
            <IconButton
              icon="trash"
              label={`Delete ${unit.title}`}
              size="sm"
              onClick={() => onDelete({ kind, item: unit })}
            />
          </div>
        ) : null}
      </div>

      {open ? (
        <>
          {topics.map((topic, topicIndex) => (
            <TopicNode
              key={topic.id}
              topic={topic}
              index={topicIndex}
              siblings={topics}
              editable={editable}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))}
          {children.map((child, childIndex) => (
            <UnitNode
              key={child.id}
              unit={child}
              index={childIndex}
              siblings={children}
              depth={depth + 1}
              editable={editable}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function TopicNode({ topic, index, siblings, editable, onEdit, onDelete, onReorder }) {
  function moveTopic(delta) {
    const next = [...siblings];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(
      'topic',
      next.map((item, position) => ({ id: item.id, display_order: position })),
    );
  }

  return (
    <div className="sp-syltree__node sp-syltree__node--topic">
      <div className="sp-syltree__body">
        <span className="sp-syltree__title">{topic.title}</span>
        <span className="sp-syltree__meta">
          <span>{formatMinutes(topic.estimated_minutes)}</span>
          {/* One status colour per row: difficulty is the badge, importance
              stays plain text so a long tree does not turn into noise. */}
          <Badge tone={statusTone(topic.difficulty)} size="sm">
            {topic.difficulty}
          </Badge>
          <span>{topic.importance} importance</span>
        </span>
      </div>
      {editable ? (
        <div className="sp-syltree__actions">
          <IconButton
            icon="chevronDown"
            label={`Move ${topic.title} up`}
            size="sm"
            variant="outline"
            className="sp-adm__flip"
            disabled={index === 0}
            onClick={() => moveTopic(-1)}
          />
          <IconButton
            icon="chevronDown"
            label={`Move ${topic.title} down`}
            size="sm"
            variant="outline"
            disabled={index === siblings.length - 1}
            onClick={() => moveTopic(1)}
          />
          <IconButton
            icon="edit"
            label={`Edit ${topic.title}`}
            size="sm"
            onClick={() => onEdit({ mode: 'edit', kind: 'topic', item: topic })}
          />
          <IconButton
            icon="trash"
            label={`Delete ${topic.title}`}
            size="sm"
            onClick={() => onDelete({ kind: 'topic', item: topic })}
          />
        </div>
      ) : null}
    </div>
  );
}
