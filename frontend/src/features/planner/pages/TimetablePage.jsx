import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function TimetablePage() {
  return (
    <PagePlaceholder
      title="Timetable"
      description="Daily, weekly and calendar views with conflict detection and smart plan generation."
      icon="calendar"
      endpoints={[
        'GET /student/study-sessions',
        'POST /student/study-sessions',
        'PATCH /student/study-sessions/:id',
        'POST /student/timetable/generate',
        'POST /student/timetable/generate/save',
      ]}
    />
  );
}
