import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function CourseManagementPage() {
  return (
    <PagePlaceholder
      title="Course Management"
      description="Create, edit, publish and archive courses and examinations."
      icon="courses"
      endpoints={[
        'GET /admin/courses',
        'POST /admin/courses',
        'PATCH /admin/courses/:id',
        'DELETE /admin/courses/:id',
      ]}
    />
  );
}
