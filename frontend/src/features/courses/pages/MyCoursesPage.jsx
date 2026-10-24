import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function MyCoursesPage() {
  return (
    <PagePlaceholder
      title="My Courses"
      description="Your enrolled courses with progress, target dates and priority."
      icon="courses"
      endpoints={[
        'GET /student/enrollments',
        'POST /student/enrollments',
        'PATCH /student/enrollments/:id',
        'DELETE /student/enrollments/:id',
      ]}
    />
  );
}
