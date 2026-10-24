import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function StudentManagementPage() {
  return (
    <PagePlaceholder
      title="Student Management"
      description="Searchable, paginated student directory with status changes and bulk actions."
      icon="users"
      endpoints={[
        'GET /admin/students',
        'PATCH /admin/students/:id/status',
        'POST /admin/students/bulk',
        'GET /admin/students/export',
      ]}
    />
  );
}
