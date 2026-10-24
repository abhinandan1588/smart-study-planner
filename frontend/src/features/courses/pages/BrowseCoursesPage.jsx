import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function BrowseCoursesPage() {
  return (
    <PagePlaceholder
      title="Browse Courses"
      description="Search published courses and examinations by title, category or level."
      icon="search"
      endpoints={[
        'GET /courses',
        'GET /courses/categories',
        'POST /student/enrollments',
      ]}
    />
  );
}
