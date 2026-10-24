import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import DateInput from '../../../components/ui/DateInput';
import IconButton from '../../../components/ui/IconButton';
import MetricTile from '../../../components/ui/MetricTile';
import Select from '../../../components/ui/Select';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import TaskDialog from '../components/TaskDialog';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { studentApi } from '../../../services/studentApi';
import { tasksApi } from '../../../services/tasksApi';
import { formatDate, isPast } from '../../../utils/date';
import { formatMinutes } from '../../../utils/format';
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  TASK_STATUS_LABELS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import './planner.css';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const SORT_OPTIONS = [
  { value: 'due_date', label: 'Due date (soonest)' },
  { value: '-due_date', label: 'Due date (latest)' },
  { value: 'priority', label: 'Priority (high first)' },
  { value: '-created', label: 'Newest first' },
  { value: 'title', label: 'Title' },
];

const STATUS_PARAM = {
  open: 'pending,in_progress',
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  all: '',
};

/** Task list backed by `GET /api/v1/student/tasks` with server-side filters. */
export default function TasksPage() {
  const toast = useToast();
  const pager = usePagination({ initialSort: 'due_date' });
  const [tab, setTab] = useState('open');
  const [priority, setPriority] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [courses, setCourses] = useState([]);

  const { page, perPage, search, sort } = pager;

  const fetchTasks = useCallback(
    () =>
      tasksApi.list({
        page,
        per_page: perPage,
        q: search,
        sort,
        status: STATUS_PARAM[tab],
        priority,
        course_id: courseId,
        due_from: dueFrom,
        due_to: dueTo,
      }),
    [page, perPage, search, sort, tab, priority, courseId, dueFrom, dueTo],
  );

  const { data, error, loading, reload } = useApi(fetchTasks, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  useEffect(() => {
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
  }, []);

  const counts = data?.counts || {};
  const tabsWithCounts = useMemo(
    () =>
      TABS.map((item) => ({
        ...item,
        count:
          item.key === 'open'
            ? (counts.pending || 0) + (counts.in_progress || 0)
            : item.key === 'all'
              ? undefined
              : counts[item.key],
      })),
    [counts],
  );

  async function quickComplete(task) {
    try {
      await tasksApi.complete(task.id);
      toast.success('Task completed', task.title);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not complete the task');
    }
  }

  async function reopen(task) {
    try {
      await tasksApi.update(task.id, { status: 'pending' });
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not reopen the task');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await tasksApi.remove(deleting.id);
      toast.success('Task deleted');
      setDeleting(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the task');
    } finally {
      setRemoving(false);
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Task',
      render: (task) => (
        <div className="sp-task__title">
          <span
            className={`sp-task__name ${task.status === 'completed' ? 'is-done' : ''}`}
          >
            {task.title}
          </span>
          <span className="sp-task__sub">
            {task.course_title || 'No course'}
            {task.topic_title ? ` · ${task.topic_title}` : ''}
            {task.recurrence_rule ? ' · repeats' : ''}
            {task.estimated_minutes
              ? ` · ${formatMinutes(task.estimated_minutes)}`
              : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      width: 110,
      render: (task) => (
        <Badge tone={statusTone(task.priority)} size="sm">
          {labelFor(PRIORITY_LABELS, task.priority)}
        </Badge>
      ),
    },
    {
      key: 'due_date',
      header: 'Due',
      width: 150,
      sortable: true,
      render: (task) => {
        if (!task.due_date) return <span className="sp-muted">No deadline</span>;
        const overdue =
          task.status !== 'completed' &&
          task.status !== 'cancelled' &&
          isPast(`${task.due_date}T23:59:59`);
        return (
          <span className={overdue ? 'sp-task__sub' : undefined}>
            {formatDate(task.due_date)}
            {task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''}
            {overdue ? (
              <>
                {' '}
                <Badge tone="danger" size="sm">
                  Overdue
                </Badge>
              </>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (task) => (
        <Badge tone={statusTone(task.status)} size="sm">
          {labelFor(TASK_STATUS_LABELS, task.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 140,
      align: 'right',
      render: (task) => (
        <div className="sp-task__rowactions">
          {task.status === 'completed' ? (
            <IconButton
              icon="refresh"
              label={`Reopen ${task.title}`}
              size="sm"
              onClick={() => reopen(task)}
            />
          ) : (
            <IconButton
              icon="check"
              label={`Complete ${task.title}`}
              size="sm"
              onClick={() => quickComplete(task)}
            />
          )}
          <IconButton
            icon="edit"
            label={`Edit ${task.title}`}
            size="sm"
            onClick={() => {
              setEditing(task);
              setDialogOpen(true);
            }}
          />
          <IconButton
            icon="trash"
            label={`Delete ${task.title}`}
            size="sm"
            onClick={() => setDeleting(task)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="sp-page">
      <PageHeader
        title="Tasks"
        description="Deadlines, priorities and recurring work. Filter by status, priority, course or due date."
        actions={
          <>
            <Button to="/app/planner" iconLeft="calendar">
              Timetable
            </Button>
            <Button
              variant="primary"
              iconLeft="plus"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              New task
            </Button>
          </>
        }
      />

      <div className="sp-grid sp-grid--4">
        <MetricTile label="Pending" value={counts.pending || 0} icon="inbox" />
        <MetricTile label="In progress" value={counts.in_progress || 0} icon="timer" />
        <MetricTile
          label="Due today"
          value={counts.due_today || 0}
          icon="calendar"
          tone={counts.due_today > 0 ? 'warning' : 'neutral'}
        />
        <MetricTile
          label="Overdue"
          value={counts.overdue || 0}
          icon="warning"
          tone={counts.overdue > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <Card padded={false}>
        <div style={{ padding: 'var(--sp-4) var(--sp-4) 0' }}>
          <Tabs
            items={tabsWithCounts}
            active={tab}
            onChange={(key) => {
              setTab(key);
              pager.setPage(1);
            }}
            ariaLabel="Task status"
          />
          <div className="sp-plan__filters" style={{ marginTop: 'var(--sp-4)' }}>
            <Select
              label="Priority"
              placeholder="Any priority"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                pager.setPage(1);
              }}
            />
            <Select
              label="Course"
              placeholder="All courses"
              options={courses}
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                pager.setPage(1);
              }}
            />
            <DateInput
              label="Due from"
              value={dueFrom}
              onChange={(event) => {
                setDueFrom(event.target.value);
                pager.setPage(1);
              }}
            />
            <DateInput
              label="Due to"
              value={dueTo}
              onChange={(event) => {
                setDueTo(event.target.value);
                pager.setPage(1);
              }}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={data?.items || []}
          loading={loading}
          error={error}
          onRetry={reload}
          searchable
          searchValue={search}
          onSearch={pager.setSearch}
          searchPlaceholder="Search tasks…"
          sort={sort}
          onSort={pager.toggleSort}
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          itemLabel="tasks"
          caption="Your tasks"
          toolbar={
            <Select
              aria-label="Sort tasks"
              options={SORT_OPTIONS}
              value={sort}
              size="sm"
              onChange={(event) => pager.setSort(event.target.value)}
            />
          }
          emptyTitle="No tasks match these filters"
          emptyDescription="Clear a filter, or create the first task for this view."
          emptyAction={
            <Button
              variant="primary"
              size="sm"
              iconLeft="plus"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              New task
            </Button>
          }
        />
      </Card>

      <TaskDialog
        open={dialogOpen}
        task={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          toast.success(editing ? 'Task updated' : 'Task created');
          setEditing(null);
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this task?"
        message={
          deleting
            ? `"${deleting.title}" will be removed permanently. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete task"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
