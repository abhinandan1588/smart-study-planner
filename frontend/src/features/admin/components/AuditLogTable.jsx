import { useCallback, useEffect, useState } from 'react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import DateInput from '../../../components/ui/DateInput';
import Dialog from '../../../components/ui/Dialog';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import useApi from '../../../hooks/useApi';
import useDebounce from '../../../hooks/useDebounce';
import usePagination from '../../../hooks/usePagination';
import { adminApi } from '../../../services/adminApi';
import { formatDateTime } from '../../../utils/date';
import '../admin.css';

/**
 * Audit trail (PRD 4.10) — `GET /api/v1/admin/audit-logs`.
 *
 * Server-side search on the action name plus entity type, actor id and a date
 * range; each row opens a dialog with the stored `detail` payload. Used as a
 * standalone page and as a tab inside admin settings.
 */

const ENTITY_OPTIONS = [
  { value: 'user', label: 'User account' },
  { value: 'course', label: 'Course' },
  { value: 'subject', label: 'Subject' },
  { value: 'syllabus_version', label: 'Syllabus version' },
  { value: 'syllabus_unit', label: 'Syllabus unit' },
  { value: 'topic', label: 'Topic' },
  { value: 'resource', label: 'Study material' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'report', label: 'Report' },
  { value: 'platform', label: 'Platform settings' },
];

function actionTone(action) {
  const name = String(action || '');
  if (/deleted|suspend|archived|expired/.test(name)) return 'danger';
  if (/created|published|activated/.test(name)) return 'success';
  if (/updated|reordered|migrated|imported|reset/.test(name)) return 'info';
  return 'neutral';
}

export default function AuditLogTable({ perPage = 20, compact = false }) {
  const pager = usePagination({ perPage });
  const [actionDraft, setActionDraft] = useState('');
  const action = useDebounce(actionDraft, 300);
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entityType, actorId, range.from, range.to]);

  const fetchLogs = useCallback(
    () =>
      adminApi.auditLogs({
        page: pager.page,
        per_page: pager.perPage,
        action,
        entity_type: entityType,
        actor_id: actorId,
        from: range.from,
        to: range.to,
      }),
    [pager.page, pager.perPage, action, entityType, actorId, range.from, range.to],
  );

  const { data, error, loading, reload } = useApi(fetchLogs, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  const columns = [
    {
      key: 'created_at',
      header: 'When',
      width: '170px',
      render: (row) => (
        <span className="sp-adm__sub">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className="sp-adm__primary">
          <Badge tone={actionTone(row.action)} size="sm">
            {row.action}
          </Badge>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="sp-adm__primary">
          <strong>{row.actor_email || 'System'}</strong>
          {row.actor_id ? (
            <span className="sp-adm__sub">#{row.actor_id}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      hideOnMobile: true,
      render: (row) =>
        row.entity_type ? (
          <span className="sp-adm__mono">
            {row.entity_type}
            {row.entity_id ? `#${row.entity_id}` : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'detail',
      header: '',
      align: 'right',
      width: '90px',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
          Details
        </Button>
      ),
    },
  ];

  const table = (
    <DataTable
      columns={columns}
      rows={data?.items || []}
      loading={loading && !data}
      error={error}
      onRetry={reload}
      searchable
      searchValue={actionDraft}
      onSearch={setActionDraft}
      searchPlaceholder="Search by action, e.g. student.status_changed"
      page={pager.meta.page}
      pages={pager.meta.pages}
      total={pager.meta.total}
      perPage={pager.meta.per_page}
      onPageChange={pager.setPage}
      itemLabel="audit entries"
      emptyTitle="No audit entries match these filters"
      emptyDescription="Administrative actions such as status changes, publications and deletions are recorded here."
      emptyIcon="shield"
      emptyAction={
        action || entityType || actorId || range.from || range.to ? (
          <Button size="sm" variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null
      }
      caption="Administrative audit log"
      onRowClick={(row) => setSelected(row)}
    />
  );

  function clearFilters() {
    setActionDraft('');
    setEntityType('');
    setActorId('');
    setRange({ from: '', to: '' });
  }

  return (
    <div className="sp-stack">
      <Card
        title={compact ? undefined : 'Filters'}
        actions={
          <Button size="sm" variant="secondary" iconLeft="refresh" onClick={reload}>
            Refresh
          </Button>
        }
      >
        <div className="sp-adm__filters">
          <Select
            label="Entity type"
            placeholder="Any entity"
            options={ENTITY_OPTIONS}
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
          />
          <Input
            label="Actor id"
            type="number"
            min="1"
            placeholder="e.g. 1"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          />
          <DateInput
            label="From"
            value={range.from}
            max={range.to || undefined}
            onChange={(event) =>
              setRange((current) => ({ ...current, from: event.target.value }))
            }
          />
          <DateInput
            label="To"
            value={range.to}
            min={range.from || undefined}
            onChange={(event) =>
              setRange((current) => ({ ...current, to: event.target.value }))
            }
          />
          <div>
            <span className="sp-adm__dt">&nbsp;</span>
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>{table}</Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Audit entry"
        description={selected ? `#${selected.id} · ${selected.action}` : undefined}
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="sp-stack">
            <dl className="sp-adm__dl">
              <div>
                <span className="sp-adm__dt">Recorded</span>
                <dd className="sp-adm__dd">{formatDateTime(selected.created_at)}</dd>
              </div>
              <div>
                <span className="sp-adm__dt">Actor</span>
                <dd className="sp-adm__dd">
                  {selected.actor_email || 'System'}
                  {selected.actor_id ? ` (#${selected.actor_id})` : ''}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">Entity</span>
                <dd className="sp-adm__dd">
                  {selected.entity_type || '—'}
                  {selected.entity_id ? `#${selected.entity_id}` : ''}
                </dd>
              </div>
              <div>
                <span className="sp-adm__dt">IP address</span>
                <dd className="sp-adm__dd">{selected.ip_address || '—'}</dd>
              </div>
            </dl>
            <div>
              <span className="sp-adm__dt">Recorded detail</span>
              <pre className="sp-adm__code">
                {selected.detail
                  ? JSON.stringify(selected.detail, null, 2)
                  : 'No additional detail was stored for this action.'}
              </pre>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
