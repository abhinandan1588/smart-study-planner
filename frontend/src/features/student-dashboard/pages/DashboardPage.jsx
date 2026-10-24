import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="Today's plan, study time, tasks, streak, goals and announcements, all computed from stored records."
      icon="dashboard"
      endpoints={[
        'GET /student/dashboard',
        'GET /student/announcements',
      ]}
    />
  );
}
