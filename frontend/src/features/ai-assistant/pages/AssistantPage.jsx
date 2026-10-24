import PagePlaceholder from '../../../components/common/PagePlaceholder';

export default function AssistantPage() {
  return (
    <PagePlaceholder
      title="AI Study Assistant"
      description="Explanations, summaries, quizzes and flashcards grounded in your authorised materials."
      icon="sparkle"
      endpoints={[
        'GET /student/ai/conversations',
        'POST /student/ai/chat',
        'POST /student/ai/quiz',
        'POST /student/ai/flashcards',
      ]}
    />
  );
}
