import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function SubjectManagementPage() {
  return (
    <PagePlaceholder
      title="Subject Management"
      description="Subjects, weightings, course links and archival."
      icon="layers"
      endpoints={[
        'GET /admin/subjects',
        'POST /admin/subjects',
        'PATCH /admin/subjects/:id',
        'DELETE /admin/subjects/:id',
      ]}
    />
  );
}
