import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function GoalsPage() {
  return (
    <PagePlaceholder
      title="Goals & Achievements"
      description="Study targets with server-recomputed progress, plus the achievements you have earned."
      icon="target"
      endpoints={[
        'GET /student/goals',
        'POST /student/goals',
        'PATCH /student/goals/:id',
        'DELETE /student/goals/:id',
        'GET /student/achievements',
      ]}
    />
  );
}
