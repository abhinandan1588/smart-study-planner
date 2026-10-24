import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function SyllabusPage() {
  return (
    <PagePlaceholder
      title="My Syllabus"
      description="Expandable subject, unit, chapter and topic tree with per-topic progress."
      icon="syllabus"
      endpoints={[
        'GET /student/courses/:id/syllabus',
        'PATCH /student/topics/:id/progress',
        'GET /student/revisions',
      ]}
    />
  );
}
