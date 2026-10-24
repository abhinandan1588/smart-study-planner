import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function MaterialsPage() {
  return (
    <PagePlaceholder
      title="Study Materials"
      description="Shared resources and your private uploads, searchable and permission checked."
      icon="folder"
      endpoints={[
        'GET /student/resources',
        'GET /student/resources/recent',
        'POST /student/resources',
        'POST /student/resources/:id/bookmark',
      ]}
    />
  );
}
