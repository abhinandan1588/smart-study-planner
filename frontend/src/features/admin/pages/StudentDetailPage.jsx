import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function StudentDetailPage() {
  return (
    <PagePlaceholder
      title="Student Detail"
      description="Profile, enrolled courses and authorised progress for one student."
      icon="users"
      endpoints={[
        'GET /admin/students/:id',
        'PATCH /admin/students/:id/status',
        'POST /admin/students/:id/password-reset',
      ]}
    />
  );
}
