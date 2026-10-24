import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function AdminDashboardPage() {
  return (
    <PagePlaceholder
      title="Admin Dashboard"
      description="Platform statistics, enrollment distribution, activity and recent administrative actions."
      icon="dashboard"
      endpoints={[
        'GET /admin/dashboard',
      ]}
    />
  );
}
