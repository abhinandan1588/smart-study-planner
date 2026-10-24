import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function AnalyticsPage() {
  return (
    <PagePlaceholder
      title="Progress Analytics"
      description="Study duration, subject split, consistency, planned versus actual time and insights."
      icon="analytics"
      endpoints={[
        'GET /student/analytics',
        'GET /student/analytics/summary',
      ]}
    />
  );
}
