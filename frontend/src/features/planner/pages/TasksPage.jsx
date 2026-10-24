import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function TasksPage() {
  return (
    <PagePlaceholder
      title="Tasks"
      description="Deadlines, priorities, estimates and statuses for everything you have to do."
      icon="check"
      endpoints={[
        'GET /student/tasks',
        'POST /student/tasks',
        'PATCH /student/tasks/:id',
        'DELETE /student/tasks/:id',
      ]}
    />
  );
}
