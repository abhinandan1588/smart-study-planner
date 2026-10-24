import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function NotificationsPage() {
  return (
    <PagePlaceholder
      title="Notifications"
      description="Session reminders, task deadlines, revisions, goal deadlines and announcements."
      icon="bell"
      endpoints={[
        'GET /student/notifications',
        'PATCH /student/notifications/:id/read',
        'POST /student/notifications/read-all',
        'DELETE /student/notifications/:id',
      ]}
    />
  );
}
