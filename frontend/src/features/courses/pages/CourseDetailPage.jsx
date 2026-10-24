import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function CourseDetailPage() {
  return (
    <PagePlaceholder
      title="Course Detail"
      description="Course description, subjects, syllabus overview and your progress."
      icon="book"
      endpoints={[
        'GET /courses/:id',
        'GET /student/courses/:id/syllabus',
      ]}
    />
  );
}
