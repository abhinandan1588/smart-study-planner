import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function MaterialManagementPage() {
  return (
    <PagePlaceholder
      title="Study Material Management"
      description="Upload, organise, publish and replace shared educational resources."
      icon="folder"
      endpoints={[
        'GET /admin/resources',
        'POST /admin/resources',
        'PATCH /admin/resources/:id',
        'GET /admin/resources/storage',
      ]}
    />
  );
}
