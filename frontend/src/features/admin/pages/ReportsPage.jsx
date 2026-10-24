import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function ReportsPage() {
  return (
    <PagePlaceholder
      title="Reports & Analytics"
      description="Aggregate registration, engagement, enrollment, progress and notification reports."
      icon="analytics"
      endpoints={[
        'GET /admin/reports',
        'GET /admin/reports/export',
      ]}
    />
  );
}
