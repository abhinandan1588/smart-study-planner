import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function AdminSettingsPage() {
  return (
    <PagePlaceholder
      title="Profile & Settings"
      description="Administrator profile, platform settings, administrator accounts, audit logs and service health."
      icon="settings"
      endpoints={[
        'GET /admin/profile',
        'GET /admin/settings',
        'GET /admin/admins',
        'GET /admin/audit-logs',
        'GET /admin/health',
      ]}
    />
  );
}
