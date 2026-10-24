import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function AnnouncementsPage() {
  return (
    <PagePlaceholder
      title="Announcements & Notifications"
      description="Draft, schedule, target and expire announcements, and review delivery."
      icon="megaphone"
      endpoints={[
        'GET /admin/announcements',
        'POST /admin/announcements',
        'PATCH /admin/announcements/:id',
        'DELETE /admin/announcements/:id',
      ]}
    />
  );
}
