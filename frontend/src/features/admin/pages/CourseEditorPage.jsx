import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function CourseEditorPage() {
  return (
    <PagePlaceholder
      title="Course Editor"
      description="Course fields, linked subjects and syllabus versions."
      icon="edit"
      endpoints={[
        'GET /admin/courses/:id',
        'PATCH /admin/courses/:id',
        'POST /admin/courses/:id/subjects',
        'PATCH /admin/courses/:id/subjects/reorder',
      ]}
    />
  );
}
