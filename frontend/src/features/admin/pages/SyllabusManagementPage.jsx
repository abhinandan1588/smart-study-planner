import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function SyllabusManagementPage() {
  return (
    <PagePlaceholder
      title="Syllabus Management"
      description="Versioned units, chapters and topics, CSV import and a student-facing preview."
      icon="syllabus"
      endpoints={[
        'GET /admin/syllabus',
        'POST /admin/syllabus/versions',
        'POST /admin/syllabus',
        'PATCH /admin/syllabus/reorder',
        'POST /admin/syllabus/import',
      ]}
    />
  );
}
