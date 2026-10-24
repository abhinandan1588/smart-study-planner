import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import DateInput from '../../../components/ui/DateInput';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Input from '../../../components/ui/Input';
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import ProgressRing from '../../../components/ui/ProgressRing';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import SyllabusTree from '../components/SyllabusTree';
import TopicDrawer from '../components/TopicDrawer';
import useApi from '../../../hooks/useApi';
import useDebounce from '../../../hooks/useDebounce';
import { studentApi } from '../../../services/studentApi';
import { syllabusApi } from '../../../services/syllabusApi';
import { formatDate } from '../../../utils/date';
import { formatMinutes, formatPercent } from '../../../utils/format';
import {
  PRIORITY_OPTIONS,
  TOPIC_STATUS_OPTIONS,
  statusTone,
} from '../../../utils/constants';
import './syllabus.css';

/* --- Immutable tree helpers (optimistic update + server reconciliation) -- */

function mapUnits(units, fn) {
  return units.map((unit) => {
    const next = fn(unit);
    return {
      ...next,
      children: next.children ? mapUnits(next.children, fn) : next.children,
    };
  });
}

/** Write a topic's progress into the tree without mutating the old object. */
function setTopicProgress(tree, topicId, progress) {
  return {
    ...tree,
    subjects: tree.subjects.map((subject) => ({
      ...subject,
      units: mapUnits(subject.units || [], (unit) => ({
        ...unit,
        topics: (unit.topics || []).map((topic) =>
          topic.id === topicId
            ? { ...topic, progress: { ...topic.progress, ...progress } }
            : topic,
        ),
      })),
    })),
  };
}

/** Apply the `rollup` block the PATCH response returns to every level. */
function applyRollup(tree, rollup) {
  if (!rollup) return tree;
  const withUnits = {
    ...tree,
    subjects: tree.subjects.map((subject) => {
      const nextUnits = mapUnits(subject.units || [], (unit) => {
        if (unit.id === rollup.chapter_id && rollup.chapter) {
          return {
            ...unit,
            progress: rollup.chapter,
            progress_percent: rollup.chapter.completion_percent,
          };
        }
        if (unit.id === rollup.unit_id && rollup.unit) {
          return {
            ...unit,
            progress: rollup.unit,
            progress_percent: rollup.unit.completion_percent,
          };
        }
        return unit;
      });
      if (subject.id === rollup.subject_id && rollup.subject) {
        return {
          ...subject,
          units: nextUnits,
          progress: rollup.subject,
          progress_percent: rollup.subject.completion_percent,
        };
      }
      return { ...subject, units: nextUnits };
    }),
  };
  return rollup.course ? { ...withUnits, totals: rollup.course } : withUnits;
}

/**
 * My Syllabus — `GET /api/v1/student/courses/:id/syllabus` renders the tree,
 * `PATCH /student/topics/:id/progress` writes each change and returns the
 * recomputed unit / subject / course percentages used to reconcile it.
 */
export default function SyllabusPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState('syllabus');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueBefore, setDueBefore] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounce(searchDraft, 300);

  const [tree, setTree] = useState(null);
  const [pendingTopicId, setPendingTopicId] = useState(null);
  const [drawerTopic, setDrawerTopic] = useState(null);
  const [revisions, setRevisions] = useState(null);

  const fetchEnrollments = useCallback(
    () => studentApi.listEnrollments({ status: 'active' }),
    [],
  );
  const {
    data: enrollmentsData,
    error: enrollmentsError,
    loading: enrollmentsLoading,
    reload: reloadEnrollments,
  } = useApi(fetchEnrollments);

  const enrollments = enrollmentsData?.items || [];
  const activeCourseId = courseId || (enrollments[0]?.course_id ?? null);

  // Land on the first enrolled course when the route carries no id.
  useEffect(() => {
    if (!courseId && enrollments.length > 0) {
      navigate(`/app/syllabus/${enrollments[0].course_id}`, { replace: true });
    }
  }, [courseId, enrollments, navigate]);

  const fetchTree = useCallback(() => {
    if (!activeCourseId) return Promise.resolve(null);
    return syllabusApi.forCourse(activeCourseId, {
      status,
      priority,
      subject_id: subjectId,
      due_before: dueBefore,
      q: search,
    });
  }, [activeCourseId, status, priority, subjectId, dueBefore, search]);

  const {
    error: treeError,
    loading: treeLoading,
    reload: reloadTree,
  } = useApi(fetchTree, {
    immediate: Boolean(activeCourseId),
    onSuccess: (payload) => setTree(payload),
  });

  useEffect(() => {
    if (tab !== 'revision') return;
    let cancelled = false;
    syllabusApi
      .revisions()
      .then((payload) => {
        if (!cancelled) setRevisions(payload);
      })
      .catch(() => setRevisions({ items: [], total: 0, overdue: 0 }));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  // Deep link from the dashboard's "continue topic" quick action.
  useEffect(() => {
    const topicParam = searchParams.get('topic');
    if (!topicParam || !tree) return;
    const target = findTopic(tree, Number(topicParam));
    if (target) setDrawerTopic(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);

  const subjectOptions = useMemo(
    () =>
      (tree?.subjects || []).map((subject) => ({
        value: String(subject.id),
        label: subject.name,
      })),
    [tree],
  );

  /** Optimistic status change, reconciled with the server's response. */
  async function changeStatus(topic, nextStatus) {
    if (!tree) return;
    const previous = tree;
    setPendingTopicId(topic.id);
    setTree((current) =>
      setTopicProgress(current, topic.id, { status: nextStatus }),
    );
    try {
      const result = await syllabusApi.updateTopicProgress(topic.id, {
        status: nextStatus,
      });
      setTree((current) =>
        applyRollup(
          setTopicProgress(current, topic.id, result.progress),
          result.rollup,
        ),
      );
      if (result.achievements_earned?.length) {
        toast.success(
          'Achievement unlocked',
          result.achievements_earned
            .map((item) => item.title || item.code)
            .join(', '),
        );
      }
    } catch (caught) {
      setTree(previous);
      toast.apiError(caught, 'Could not update this topic');
    } finally {
      setPendingTopicId(null);
    }
  }

  function onTopicSaved(topicId, result) {
    setTree((current) =>
      applyRollup(setTopicProgress(current, topicId, result.progress), result.rollup),
    );
    setDrawerTopic((current) =>
      current && current.id === topicId
        ? { ...current, progress: result.progress }
        : current,
    );
  }

  if (enrollmentsLoading && !enrollmentsData) return <PageLoader tiles={4} cards={2} />;

  if (enrollmentsError) {
    return (
      <div className="sp-page">
        <PageHeader title="My Syllabus" />
        <ErrorState error={enrollmentsError} onRetry={reloadEnrollments} boxed />
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="sp-page">
        <PageHeader title="My Syllabus" />
        <Card>
          <EmptyState
            icon="syllabus"
            title="No syllabus to track yet"
            description="Enroll in a published course and its subjects, units, chapters and topics appear here with your own progress."
            action={
              <Button variant="primary" to="/app/courses/browse" iconLeft="search">
                Browse courses
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const totals = tree?.totals || {};
  const enrollment = enrollments.find(
    (item) => item.course_id === Number(activeCourseId),
  );

  return (
    <div className="sp-page">
      <PageHeader
        title="My Syllabus"
        description="Track every topic, record time, keep notes and schedule revisions."
        actions={
          <>
            <Select
              aria-label="Course"
              options={enrollments.map((item) => ({
                value: String(item.course_id),
                label: item.course?.title || `Course ${item.course_id}`,
              }))}
              value={String(activeCourseId || '')}
              onChange={(event) => navigate(`/app/syllabus/${event.target.value}`)}
            />
            {activeCourseId ? (
              <Button to={`/app/courses/${activeCourseId}`} iconLeft="courses">
                Course
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs
        items={[
          { key: 'syllabus', label: 'Syllabus', count: totals.total_topics },
          {
            key: 'revision',
            label: 'Revision queue',
            count: revisions?.total,
          },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Syllabus sections"
      />

      {tab === 'syllabus' ? (
        <>
          <Card
            title={tree?.course?.title || 'Syllabus'}
            subtitle={
              tree?.version
                ? `Published syllabus version ${tree.version.version_number}`
                : undefined
            }
            actions={
              <Button size="sm" variant="ghost" iconLeft="refresh" onClick={reloadTree}>
                Refresh
              </Button>
            }
          >
            <div className="sp-syl__totals">
              <ProgressRing
                value={totals.completion_percent || 0}
                size={116}
                label={formatPercent(totals.completion_percent)}
                caption="complete"
                tone={totals.completion_percent >= 100 ? 'success' : 'primary'}
              />
              <div className="sp-syl__totalsbars">
                <ProgressBar
                  value={totals.completion_percent || 0}
                  showLabel
                  label={`Unweighted · ${totals.completed_topics || 0} of ${
                    totals.total_topics || 0
                  } topics`}
                />
                <ProgressBar
                  value={totals.weighted_completion_percent || 0}
                  showLabel
                  tone="info"
                  label="Weighted by estimated study time"
                />
                {enrollment?.target_completion_date ? (
                  <p className="sp-syl__meta">
                    Target completion {formatDate(enrollment.target_completion_date)}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="sp-grid sp-grid--4">
            <MetricTile
              label="Completed"
              value={totals.completed_topics || 0}
              icon="check"
              tone="success"
            />
            <MetricTile
              label="In progress"
              value={totals.in_progress_topics || 0}
              icon="timer"
              tone="primary"
            />
            <MetricTile
              label="Not started"
              value={totals.not_started_topics || 0}
              icon="inbox"
            />
            <MetricTile
              label="Time recorded"
              value={formatMinutes(totals.time_spent_minutes)}
              sub={`of ${formatMinutes(totals.estimated_minutes)} estimated`}
              icon="analytics"
            />
          </div>

          <Card title="Filters" padded>
            <div className="sp-syl__filters">
              <Input
                label="Search topics"
                type="search"
                iconLeft="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Topic title…"
              />
              <Select
                label="Status"
                placeholder="Any status"
                options={TOPIC_STATUS_OPTIONS}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              />
              <Select
                label="Priority"
                placeholder="Any priority"
                options={PRIORITY_OPTIONS}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
              <Select
                label="Subject"
                placeholder="All subjects"
                options={subjectOptions}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              />
              <DateInput
                label="Target date before"
                value={dueBefore}
                onChange={(event) => setDueBefore(event.target.value)}
              />
            </div>
          </Card>

          {treeError ? (
            <ErrorState error={treeError} onRetry={reloadTree} boxed />
          ) : treeLoading && !tree ? (
            <Card>
              <Skeleton variant="text" count={6} />
            </Card>
          ) : (
            <SyllabusTree
              subjects={tree?.subjects || []}
              pendingTopicId={pendingTopicId}
              onStatusChange={changeStatus}
              onOpenTopic={setDrawerTopic}
            />
          )}
        </>
      ) : (
        <Card
          title="Revision queue"
          subtitle="Topics you flagged for revision, soonest first"
        >
          {!revisions ? (
            <Skeleton variant="text" count={4} />
          ) : revisions.items.length === 0 ? (
            <EmptyState
              icon="refresh"
              title="Nothing scheduled for revision"
              description="Open a topic and tick “Mark for revision” with a date to build a revision cycle."
              compact
            />
          ) : (
            <>
              {revisions.overdue > 0 ? (
                <p className="sp-syl__meta" style={{ marginBottom: 'var(--sp-3)' }}>
                  {revisions.overdue} overdue.
                </p>
              ) : null}
              <ul>
                {revisions.items.map((item) => (
                  <li className="sp-revrow" key={item.topic_id}>
                    <div>
                      <p className="sp-topic__title">{item.title}</p>
                      <p className="sp-syl__meta">
                        {item.subject_name || 'Syllabus'} ·{' '}
                        {formatMinutes(item.estimated_minutes)} est.
                        {item.course_id ? (
                          <>
                            {' · '}
                            <Link to={`/app/syllabus/${item.course_id}`}>
                              Open course
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="sp-row">
                      <Badge
                        tone={item.is_overdue ? 'danger' : statusTone('scheduled')}
                        size="sm"
                      >
                        {item.next_revision_date
                          ? formatDate(item.next_revision_date)
                          : 'No date'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <TopicDrawer
        open={Boolean(drawerTopic)}
        topic={drawerTopic}
        onClose={() => setDrawerTopic(null)}
        onSaved={onTopicSaved}
      />
    </div>
  );
}

function findTopic(tree, topicId) {
  let found = null;
  const walkUnit = (unit) => {
    (unit.topics || []).forEach((topic) => {
      if (topic.id === topicId) found = topic;
    });
    (unit.children || []).forEach(walkUnit);
  };
  (tree.subjects || []).forEach((subject) =>
    (subject.units || []).forEach(walkUnit),
  );
  return found;
}
