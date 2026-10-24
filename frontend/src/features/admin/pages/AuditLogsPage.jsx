import PageHeader from '../../../components/common/PageHeader';
import Button from '../../../components/ui/Button';
import AuditLogTable from '../components/AuditLogTable';
import '../admin.css';

/**
 * Audit log review (PRD 4.10) — `GET /api/v1/admin/audit-logs`.
 *
 * Standalone page for the full trail; the same table is embedded in the
 * administrator settings page under its own tab.
 */
export default function AuditLogsPage() {
  return (
    <div className="sp-page">
      <PageHeader
        title="Audit Logs"
        description="Every significant administrative action: who did it, to what, and when."
        actions={
          <Button variant="secondary" to="/admin/settings">
            Profile & settings
          </Button>
        }
      />
      <AuditLogTable perPage={25} />
    </div>
  );
}
