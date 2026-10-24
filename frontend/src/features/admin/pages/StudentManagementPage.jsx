import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DataTable from '../../../components/ui/DataTable';
import DateInput from '../../../components/ui/DateInput';
import Drawer from '../../../components/ui/Drawer';
import Select from '../../../components/ui/Select';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDate, formatDateTime } from '../../../utils/date';
import { formatMinutes, formatNumber } from '../../../utils/format';
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_STATUS_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import '../admin.css';

/**
 * Student management (PRD 4.3).
 *
 * `GET /api/v1/admin/students` is the single source of truth for the table:
 * search, status / course / registration-date filters, sorting and pagination
 * are all server side. Status changes are applied optimistically to the row and
 * then reconciled with the `student` object the API returns, so a rejected
 * change snaps back instead of lying to the operator.
 */
export default function StudentManagementPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const pager = usePagination({ initialSort: '-created_at' });

  const [status, setStatus] = useState('');
  const [courseId, setCourseId] = useState('');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [registeredTo, setRegisteredTo] = useState('');
  const [courses, setCourses] = useState([]);

  const [selectedIds, setSelectedIds] = useState([]);
  const [statusChange, setStatusChange] = useState(null); // { student, next }
  const [reason, setReason] = useState('');
  const [bulk, setBulk] = useState(null); // 'suspend' | 'activate'
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [peek, setPeek] = useState(null); // student row opened in the drawer
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    pager.setPage(1);
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, courseId, registeredFrom, registeredTo, pager.search]);

  useEffect(() => {
    adminApi.courses
      .list({ per_page: 100, sort: 'title' })
      .then((payload) =>
        setCourses(
          (payload.items || []).map((course) => ({
            value: String(course.id),
            label: `${course.title} (${course.status})`,
          })),
        ),
      )
      .catch(() => setCourses([]));
  }, []);

  const filters = useMemo(
    () => ({
      status,
      course_id: courseId,
      registered_from: registeredFrom,
      registered_to: registeredTo,
    }),
    [status, courseId, registeredFrom, registeredTo],
  );

  const fetchStudents = useCallback(
    () => adminApi.students.list({ ...pager.params, ...filters }),
    [pager.params, filters],
  );

  const { data, error, loading, reload, setData } = useApi(fetchStudents, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  const rows = data?.items || [];
  const hasFilters = Boolean(
    status || courseId || registeredFrom || registeredTo || pager.search,
  );

  /** Replace one row in place with whatever the server last said about it. */
  function patchRow(id, changes) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((row) =>
          row.id === id ? { ...row, ...changes } : row,
        ),
      };
    });
  }

  async function applyStatusChange() {
    if (!statusChange) return;
    const { student, next } = statusChange;
    const previous = student.status;
    setBusy(true);
    patchRow(student.id, { status: next, _pending: true }); // optimistic
    try {
      const result = await adminApi.students.setStatus(
        student.id,
        next,
        reason.trim() || undefined,
      );
      // Reconcile: the API's own row wins over the optimistic guess.
      patchRow(student.id, { ...(result.student || {}), _pending: false });
      toast.success(
        result.changed ? 'Account status updated' : 'No change needed',
        result.message,
      );
      setStatusChange(null);
      setReason('');
    } catch (caught) {
      patchRow(student.id, { status: previous, _pending: false }); // revert
      toast.apiError(caught, 'Could not change the account status');
    } finally {
      setBusy(false);
    }
  }

  async function applyBulk() {
    if (!bulk || selectedIds.length === 0) return;
    const nextStatus = bulk === 'suspend' ? 'suspended' : 'active';
    setBusy(true);
    selectedIds.forEach((id) => patchRow(id, { status: nextStatus, _pending: true }));
    try {
      const result = await adminApi.students.bulk(selectedIds, bulk);
      toast.success(
        `${result.updated} account${result.updated === 1 ? '' : 's'} updated`,
        result.skipped ? `${result.skipped} already ${nextStatus}.` : undefined,
      );
      setBulk(null);
      setSelectedIds([]);
      await reload();
    } catch (caught) {
      toast.apiError(caught, 'The bulk action failed');
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function issueReset() {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const result = await adminApi.students.issuePasswordReset(resetTarget.id);
      toast.success('Recovery token issued', result.message);
      setResetTarget(null);
    } catch (caught) {
      toast.apiError(caught, 'Could not issue a recovery token');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await adminApi.students.exportCsv(filters);
      toast.success('Export started', 'The CSV contains the permitted directory fields.');
    } catch (caught) {
      toast.apiError(caught, 'Could not export the directory');
    } finally {
      setExporting(false);
    }
  }

  const columns = [
    {
      key: 'full_name',
      header: 'Student',
      sortable: true,
      render: (row) => (
        <div className="sp-adm__primary">
          <Link to={`/admin/students/${row.id}`}>
            <strong>{row.full_name}</strong>
          </Link>
          <span className="sp-adm__sub">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '160px',
      render: (row) => (
        <div className="sp-adm__chips">
          <Badge tone={statusTone(row.status)} size="sm" dot>
            {labelFor(ACCOUNT_STATUS_LABELS, row.status)}
          </Badge>
          {row.email_verified ? null : (
            <Badge tone="warning" size="sm">
              Unverified
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'enrollment_count',
      header: 'Enrolled',
      align: 'right',
      width: '90px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.enrollment_count),
    },
    {
      key: 'completed_topics',
      header: 'Topics done',
      align: 'right',
      width: '110px',
      hideOnMobile: true,
      render: (row) => formatNumber(row.completed_topics),
    },
    {
      key: 'created_at',
      header: 'Registered',
      sortable: true,
      width: '130px',
      hideOnMobile: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'last_login_at',
      header: 'Last login',
      sortable: true,
      width: '140px',
      hideOnMobile: true,
      render: (row) =>
        row.last_login_at ? formatDate(row.last_login_at) : 'Never',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '230px',
      render: (row) => (
        <div
          className="sp-adm__rowactions"
          onClick={(event) => event.stopPropagation()}
        >
          <Button size="sm" variant="ghost" onClick={() => setPeek(row)}>
            View
          </Button>
          {row.status === 'suspended' ? (
            <Button
              size="sm"
              variant="secondary"
              iconLeft="check"
              disabled={row._pending}
              onClick={() => {
                setReason('');
                setStatusChange({ student: row, next: 'active' });
              }}
            >
              Activate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              className="sp-adm__dangerbtn"
              iconLeft="shield"
              disabled={row._pending}
              onClick={() => {
                setReason('');
                setStatusChange({ student: row, next: 'suspended' });
              }}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="sp-page">
      <PageHeader
        title="Student Management"
        description="Search the student directory, review authorised activity and manage account status."
        actions={
          <Button
            variant="secondary"
            iconLeft="download"
            loading={exporting}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      <Card title="Filters">
        <div className="sp-adm__filters">
          <Select
            label="Account status"
            placeholder="Any status"
            options={ACCOUNT_STATUS_OPTIONS}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Select
            label="Enrolled in course"
            placeholder="Any course"
            options={courses}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          />
          <DateInput
            label="Registered from"
            value={registeredFrom}
            max={registeredTo || undefined}
            onChange={(event) => setRegisteredFrom(event.target.value)}
          />
          <DateInput
            label="Registered to"
            value={registeredTo}
            min={registeredFrom || undefined}
            onChange={(event) => setRegisteredTo(event.target.value)}
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button
              variant="secondary"
              disabled={!hasFilters}
              onClick={() => {
                setStatus('');
                setCourseId('');
                setRegisteredFrom('');
                setRegisteredTo('');
                pager.setSearch('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading && !data}
          error={error}
          onRetry={reload}
          searchable
          searchValue={pager.search}
          onSearch={pager.setSearch}
          searchPlaceholder="Search by name or email…"
          sort={pager.sort}
          onSort={pager.toggleSort}
          page={pager.meta.page}
          pages={pager.meta.pages}
          total={pager.meta.total}
          perPage={pager.meta.per_page}
          onPageChange={pager.setPage}
          itemLabel="students"
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={
            <>
              <Button size="sm" variant="secondary" onClick={() => setBulk('activate')}>
                Activate
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBulk('suspend')}>
                Suspend
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </>
          }
          emptyTitle={
            hasFilters ? 'No students match these filters' : 'No student accounts yet'
          }
          emptyDescription={
            hasFilters
              ? 'Clear a filter or widen the registration date range.'
              : 'Student accounts appear here as soon as somebody registers.'
          }
          emptyIcon="users"
          caption="Student directory"
          onRowClick={(row) => navigate(`/admin/students/${row.id}`)}
        />
      </Card>

      <StudentPeekDrawer
        student={peek}
        onClose={() => setPeek(null)}
        onPasswordReset={(student) => {
          setPeek(null);
          setResetTarget(student);
        }}
      />

      <ConfirmDialog
        open={Boolean(statusChange)}
        title={
          statusChange?.next === 'suspended'
            ? 'Suspend this account?'
            : 'Activate this account?'
        }
        message={
          statusChange
            ? statusChange.next === 'suspended'
              ? `${statusChange.student.full_name} will be signed out and blocked from the API until the account is activated again. Their study records are kept.`
              : `${statusChange.student.full_name} will be able to sign in again, and their email address will be marked verified.`
            : ''
        }
        details={
          <Textarea
            label="Reason (recorded in the audit log)"
            rows={2}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional note explaining this change"
          />
        }
        confirmLabel={statusChange?.next === 'suspended' ? 'Suspend account' : 'Activate account'}
        tone={statusChange?.next === 'suspended' ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={applyStatusChange}
        onClose={() => {
          setStatusChange(null);
          setReason('');
        }}
      />

      <ConfirmDialog
        open={Boolean(bulk)}
        title={bulk === 'suspend' ? 'Suspend selected accounts?' : 'Activate selected accounts?'}
        message={
          bulk
            ? `${selectedIds.length} account${
                selectedIds.length === 1 ? '' : 's'
              } will be ${bulk === 'suspend' ? 'suspended' : 'activated'}. The change is recorded in the audit log.`
            : ''
        }
        confirmLabel={bulk === 'suspend' ? 'Suspend all' : 'Activate all'}
        tone={bulk === 'suspend' ? 'danger' : 'primary'}
        loading={busy}
        onConfirm={applyBulk}
        onClose={() => setBulk(null)}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Issue a password recovery token?"
        message={
          resetTarget
            ? `A one-hour recovery token will be issued for ${resetTarget.email}. Administrators never see or set a password.`
            : ''
        }
        confirmLabel="Issue token"
        tone="primary"
        loading={busy}
        onConfirm={issueReset}
        onClose={() => setResetTarget(null)}
      />
    </div>
  );
}

/* --- quick-look drawer -------------------------------------------------- */

/** Loads `GET /admin/students/:id` for the row the operator clicked "View" on. */
function StudentPeekDrawer({ student, onClose, onPasswordReset }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    if (!student) {
      setDetail(null);
      setFailed(null);
      return;
    }
    let active = true;
    setLoading(true);
    setFailed(null);
    adminApi.students
      .get(student.id)
      .then((payload) => {
        if (active) setDetail(payload);
      })
      .catch((caught) => {
        if (active) setFailed(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [student]);

  const activity = detail?.activity;

  return (
    <Drawer
      open={Boolean(student)}
      onClose={onClose}
      title={student?.full_name || 'Student'}
      description={student?.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={() => onPasswordReset(student)}>
            Password recovery
          </Button>
          <Button variant="primary" to={`/admin/students/${student?.id}`}>
            Open full profile
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="sp-muted">Loading activity…</p>
      ) : failed ? (
        <p className="sp-adm__error">{failed.message}</p>
      ) : detail ? (
        <div className="sp-stack">
          <dl className="sp-adm__dl">
            <div>
              <span className="sp-adm__dt">Status</span>
              <dd className="sp-adm__dd">
                <Badge tone={statusTone(detail.student.status)} size="sm">
                  {labelFor(ACCOUNT_STATUS_LABELS, detail.student.status)}
                </Badge>
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Registered</span>
              <dd className="sp-adm__dd">{formatDate(detail.account.created_at)}</dd>
            </div>
            <div>
              <span className="sp-adm__dt">Last login</span>
              <dd className="sp-adm__dd">
                {detail.account.last_login_at
                  ? formatDateTime(detail.account.last_login_at)
                  : 'Never'}
              </dd>
            </div>
            <div>
              <span className="sp-adm__dt">Syllabus completion</span>
              <dd className="sp-adm__dd">
                {detail.progress?.completion_percent ?? 0}%
              </dd>
            </div>
          </dl>

          <Card title={`Activity (last ${activity?.window_days ?? 30} days)`}>
            <dl className="sp-adm__dl">
              <div>
                <span className="sp-adm__dt">Study sessions</span>
                <dd className="sp-adm__dd">{formatNumber(activity?.study_sessions)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Studied</span>
                <dd className="sp-adm__dd">{formatMinutes(activity?.studied_minutes)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Focus time</span>
                <dd className="sp-adm__dd">{formatMinutes(activity?.focus_minutes)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Active goals</span>
                <dd className="sp-adm__dd">{formatNumber(activity?.active_goals)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Enrolled courses">
            {detail.enrollments?.length ? (
              <ul className="sp-adm__list">
                {detail.enrollments.map((enrollment) => (
                  <li key={enrollment.id}>
                    <span className="sp-adm__primary">
                      <span className="sp-adm__itemtitle">{enrollment.course_title}</span>
                      <span className="sp-adm__itemmeta">
                        {enrollment.progress?.completed_topics ?? 0} of{' '}
                        {enrollment.progress?.total_topics ?? 0} topics ·{' '}
                        {enrollment.progress_percent ?? 0}%
                      </span>
                    </span>
                    <Badge tone={statusTone(enrollment.status)} size="sm">
                      {enrollment.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sp-muted">This student has not enrolled in a course yet.</p>
            )}
          </Card>

          <p className="sp-adm__note">{detail.privacy_note}</p>
        </div>
      ) : null}
    </Drawer>
  );
}
