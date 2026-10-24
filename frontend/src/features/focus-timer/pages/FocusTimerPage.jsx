import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function FocusTimerPage() {
  return (
    <PagePlaceholder
      title="Focus Timer"
      description="Pomodoro and custom focus sessions, validated on the server and recoverable after a refresh."
      icon="timer"
      endpoints={[
        'GET /student/focus-sessions/active',
        'POST /student/focus-sessions',
        'PATCH /student/focus-sessions/:id',
        'GET /student/focus-sessions',
      ]}
    />
  );
}
