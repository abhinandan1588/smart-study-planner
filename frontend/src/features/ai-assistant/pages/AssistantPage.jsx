import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Checkbox from '../../../components/ui/Checkbox';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Dialog from '../../../components/ui/Dialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Textarea from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import MessageThread from '../components/MessageThread';
import useApi from '../../../hooks/useApi';
import { aiApi } from '../../../services/aiApi';
import { studentApi } from '../../../services/studentApi';
import { formatBytes } from '../../../utils/format';
import { relativeFromNow } from '../../../utils/date';
import { AI_DISCLAIMER, optionsFrom } from '../../../utils/constants';
import './assistant.css';

const MODE_OPTIONS = optionsFrom({
  explain: 'Explain',
  summary: 'Summarise',
  revision_plan: 'Revision plan',
  breakdown: 'Break into steps',
});

const LEVEL_OPTIONS = optionsFrom({
  simple: 'Simple',
  standard: 'Standard',
  advanced: 'Advanced',
});

/** Reveal speed for the progressive answer rendering, in characters per tick. */
const REVEAL_CHARS = 6;
const REVEAL_MS = 16;

/**
 * AI Study Assistant (PRD 3.9).
 *
 * All generation happens server side: this page only calls
 * `/api/v1/student/ai/*`. No provider key, model name or credential is ever
 * referenced here — the backend reports whether generation is available
 * through `GET /student/ai/status`, and answers carry the retrieved chunks
 * they were grounded in.
 */
export default function AssistantPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState('explain');
  const [level, setLevel] = useState('standard');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [cards, setCards] = useState(null);
  const [generating, setGenerating] = useState(null);

  // Progressive rendering of the newest assistant answer.
  const [streamingText, setStreamingText] = useState(null);
  const [streamingDone, setStreamingDone] = useState(true);
  const revealRef = useRef(null);

  const fetchStatus = useCallback(() => aiApi.status(), []);
  const { data: status, error: statusError, reload: reloadStatus } = useApi(fetchStatus);

  const fetchConversations = useCallback(() => aiApi.listConversations(), []);
  const {
    data: conversations,
    error: conversationsError,
    loading: conversationsLoading,
    reload: reloadConversations,
  } = useApi(fetchConversations);

  const fetchConversation = useCallback(() => {
    if (!conversationId) return Promise.resolve(null);
    return aiApi.getConversation(conversationId);
  }, [conversationId]);
  const {
    data: conversation,
    error: conversationError,
    loading: conversationLoading,
    reload: reloadConversation,
  } = useApi(fetchConversation, {
    immediate: Boolean(conversationId),
    onSuccess: (payload) => {
      setMessages(payload?.messages || []);
      setStreamingText(null);
      setStreamingDone(true);
      if (payload?.conversation?.course_id) {
        setCourseId(String(payload.conversation.course_id));
      }
    },
  });

  const fetchDocuments = useCallback(() => aiApi.listDocuments(), []);
  const {
    data: documents,
    error: documentsError,
    loading: documentsLoading,
    reload: reloadDocuments,
  } = useApi(fetchDocuments);

  useEffect(() => {
    studentApi
      .listEnrollments({ status: 'active' })
      .then((payload) =>
        setCourses(
          (payload.items || []).map((item) => ({
            value: String(item.course_id),
            label: item.course?.title || `Course ${item.course_id}`,
          })),
        ),
      )
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setStreamingText(null);
    }
  }, [conversationId]);

  useEffect(
    () => () => {
      if (revealRef.current) clearInterval(revealRef.current);
    },
    [],
  );

  /** Reveal an answer a few characters at a time. */
  function revealAnswer(fullText) {
    if (revealRef.current) clearInterval(revealRef.current);
    if (!fullText) {
      setStreamingText(null);
      setStreamingDone(true);
      return;
    }
    let shown = 0;
    setStreamingText('');
    setStreamingDone(false);
    revealRef.current = setInterval(() => {
      shown += REVEAL_CHARS;
      if (shown >= fullText.length) {
        setStreamingText(fullText);
        setStreamingDone(true);
        clearInterval(revealRef.current);
        revealRef.current = null;
      } else {
        setStreamingText(fullText.slice(0, shown));
      }
    }, REVEAL_MS);
  }

  async function newConversation() {
    try {
      const payload = await aiApi.createConversation({
        course_id: courseId ? Number(courseId) : null,
      });
      reloadConversations();
      navigate(`/app/assistant/${payload.conversation.id}`);
    } catch (caught) {
      toast.apiError(caught, 'Could not start a conversation');
    }
  }

  async function send(event) {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || sending) return;

    setSending(true);
    setSendError(null);
    const optimisticUser = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticUser]);
    setDraft('');

    try {
      const payload = await aiApi.chat({
        conversation_id: conversationId ? Number(conversationId) : null,
        message: question,
        mode,
        level,
        course_id: courseId ? Number(courseId) : null,
        resource_ids: selectedDocs.length ? selectedDocs : null,
      });

      const answer = payload.message;
      setMessages((current) => [...current, answer]);
      revealAnswer(answer?.content || '');

      if (payload.ai_configured === false) {
        toast.warning(
          'AI generation is not configured',
          'Answered from your authorised documents instead.',
        );
      }

      if (!conversationId && payload.conversation_id) {
        navigate(`/app/assistant/${payload.conversation_id}`, { replace: true });
      }
      reloadConversations();
    } catch (caught) {
      // The backend answers 503 AI_UNAVAILABLE rather than a 500, so the rest
      // of the planner keeps working while generation is down.
      setMessages((current) => current.filter((item) => item.id !== optimisticUser.id));
      setDraft(question);
      setSendError(caught);
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await aiApi.deleteConversation(deleting.id);
      toast.success('Conversation deleted');
      setDeleting(null);
      reloadConversations();
      if (String(deleting.id) === String(conversationId)) {
        navigate('/app/assistant', { replace: true });
      }
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the conversation');
    } finally {
      setRemoving(false);
    }
  }

  async function generate(kind) {
    if (!courseId) {
      toast.warning('Pick a course first', 'Quizzes and flashcards need a topic source.');
      return;
    }
    setGenerating(kind);
    try {
      if (kind === 'quiz') {
        const payload = await aiApi.quiz({ course_id: Number(courseId), count: 5 });
        setQuiz(payload);
      } else {
        const payload = await aiApi.flashcards({ course_id: Number(courseId), count: 8 });
        setCards(payload);
      }
    } catch (caught) {
      toast.apiError(
        caught,
        caught.code === 'AI_NOT_CONFIGURED'
          ? 'AI generation is not configured'
          : 'Could not generate that',
      );
    } finally {
      setGenerating(null);
    }
  }

  const aiConfigured = status?.ai_configured;
  const docItems = documents?.items || [];

  if (conversationsLoading && !conversations) return <PageLoader cards={2} />;

  return (
    <div className="sp-page">
      <PageHeader
        title="AI Study Assistant"
        description="Explanations, summaries and revision plans grounded in the material you are allowed to read."
        actions={
          <>
            <Button iconLeft="folder" onClick={() => setDocsOpen(true)}>
              Documents{selectedDocs.length ? ` (${selectedDocs.length})` : ''}
            </Button>
            <Button variant="primary" iconLeft="plus" onClick={newConversation}>
              New conversation
            </Button>
          </>
        }
      />

      {statusError ? (
        <ErrorState
          error={statusError}
          title="Could not read the assistant's status"
          onRetry={reloadStatus}
          boxed
        />
      ) : aiConfigured === false ? (
        <div className="sp-ai__notice" role="status">
          <Icon name="info" size={18} />
          <div>
            <strong>AI generation is not configured on the server.</strong>
            <p>
              Answers are built from the matching passages in your authorised
              documents and syllabus instead of a language model, and every
              other part of the planner is unaffected. Generated answers,
              quizzes and flashcards need an administrator to configure a
              provider server side.
            </p>
          </div>
        </div>
      ) : null}

      <div className="sp-ai">
        <div className="sp-ai__side">
          <Card title="Conversations" padded>
            {conversationsError ? (
              <ErrorState error={conversationsError} onRetry={reloadConversations} compact />
            ) : conversations?.items?.length ? (
              <div className="sp-ai__convlist">
                {conversations.items.map((item) => (
                  <div
                    key={item.id}
                    className={`sp-ai__conv ${
                      String(item.id) === String(conversationId) ? 'is-active' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="sp-ai__convbody"
                      style={{
                        border: 0,
                        background: 'transparent',
                        textAlign: 'left',
                        font: 'inherit',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      onClick={() => navigate(`/app/assistant/${item.id}`)}
                    >
                      <span className="sp-ai__convtitle">{item.title}</span>
                      <span className="sp-ai__convmeta">
                        {item.message_count} messages
                        {item.last_message_at
                          ? ` · ${relativeFromNow(item.last_message_at)}`
                          : ''}
                      </span>
                    </button>
                    <IconButton
                      icon="trash"
                      size="sm"
                      label={`Delete "${item.title}"`}
                      onClick={() => setDeleting(item)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="sparkle"
                title="No conversations yet"
                description="Start one and ask about any topic in your syllabus."
                action={
                  <Button size="sm" variant="primary" onClick={newConversation}>
                    New conversation
                  </Button>
                }
                compact
              />
            )}
          </Card>

          <Card title="Generate" subtitle="Practice material for the selected course">
            <div className="sp-stack" style={{ gap: 'var(--sp-2)' }}>
              <Select
                label="Course"
                placeholder="Select a course"
                options={courses}
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              />
              <Button
                iconLeft="check"
                loading={generating === 'quiz'}
                disabled={!aiConfigured}
                onClick={() => generate('quiz')}
              >
                Practice quiz
              </Button>
              <Button
                iconLeft="layers"
                loading={generating === 'flashcards'}
                disabled={!aiConfigured}
                onClick={() => generate('flashcards')}
              >
                Flashcards
              </Button>
              {!aiConfigured ? (
                <p className="sp-ai__disclaimer">
                  Quizzes and flashcards need a configured provider on the server.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card
          title={conversation?.conversation?.title || 'New conversation'}
          subtitle={
            status
              ? aiConfigured
                ? `Provider ${status.provider}${status.model ? ` · ${status.model}` : ''} · ${
                    status.limits?.rate_limit || ''
                  }`
                : 'Retrieval-only mode'
              : undefined
          }
          actions={
            conversationId ? (
              <Button
                size="sm"
                variant="ghost"
                iconLeft="refresh"
                onClick={reloadConversation}
              >
                Reload
              </Button>
            ) : null
          }
        >
          {conversationError ? (
            <ErrorState error={conversationError} onRetry={reloadConversation} compact />
          ) : conversationLoading && conversationId && messages.length === 0 ? (
            <Skeleton variant="text" count={6} />
          ) : (
            <MessageThread
              messages={messages}
              streamingText={streamingText}
              streamingDone={streamingDone}
              pending={sending}
            />
          )}

          {sendError ? (
            <ErrorState
              error={sendError}
              title={
                sendError.code === 'AI_NOT_CONFIGURED'
                  ? 'AI generation is not configured'
                  : 'The assistant is unavailable'
              }
              onRetry={send}
              retryLabel="Send again"
              compact
            />
          ) : null}

          <form className="sp-ai__composer" onSubmit={send}>
            <div className="sp-ai__options">
              <Select
                label="Mode"
                options={MODE_OPTIONS}
                value={mode}
                size="sm"
                onChange={(event) => setMode(event.target.value)}
              />
              <Select
                label="Detail level"
                options={LEVEL_OPTIONS}
                value={level}
                size="sm"
                onChange={(event) => setLevel(event.target.value)}
              />
              <Select
                label="Course context"
                placeholder="No course"
                options={courses}
                value={courseId}
                size="sm"
                onChange={(event) => setCourseId(event.target.value)}
              />
              <div className="sp-field">
                <span className="sp-field__label">Documents</span>
                <Button size="sm" iconLeft="folder" onClick={() => setDocsOpen(true)}>
                  {selectedDocs.length
                    ? `${selectedDocs.length} selected`
                    : 'All authorised'}
                </Button>
              </div>
            </div>

            <div className="sp-ai__composerrow">
              <Textarea
                label="Your question"
                rows={3}
                value={draft}
                placeholder="Explain the Non-cooperation movement in simple terms…"
                maxLength={status?.limits?.max_message_chars || 4000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    send(event);
                  }
                }}
              />
              <Button
                variant="primary"
                type="submit"
                iconLeft="sparkle"
                loading={sending}
                disabled={!draft.trim()}
              >
                Ask
              </Button>
            </div>

            <p className="sp-ai__disclaimer">
              {conversation?.disclaimer || AI_DISCLAIMER} Press Ctrl/Cmd + Enter to send.
            </p>
          </form>
        </Card>
      </div>

      {/* Document selection for retrieval */}
      <Dialog
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        title="Documents for retrieval"
        description="Only material you are authorised to read is listed. Leave everything unticked to search all of it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedDocs([])}>
              Clear selection
            </Button>
            <Button variant="primary" onClick={() => setDocsOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {documentsError ? (
          <ErrorState error={documentsError} onRetry={reloadDocuments} compact />
        ) : documentsLoading && !documents ? (
          <Skeleton variant="text" count={5} />
        ) : docItems.length ? (
          <div className="sp-ai__docs">
            {docItems.map((doc) => (
              <div
                className={`sp-ai__doc ${
                  selectedDocs.includes(doc.resource_id) ? 'is-selected' : ''
                }`}
                key={doc.resource_id}
              >
                <Checkbox
                  label={doc.title}
                  description={[
                    doc.course_title,
                    doc.indexed ? `${doc.chunk_count} indexed chunks` : 'not indexed yet',
                    doc.file_size_bytes ? formatBytes(doc.file_size_bytes) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  checked={selectedDocs.includes(doc.resource_id)}
                  onChange={() =>
                    setSelectedDocs((current) =>
                      current.includes(doc.resource_id)
                        ? current.filter((id) => id !== doc.resource_id)
                        : [...current, doc.resource_id],
                    )
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="folder"
            title="No indexable documents"
            description="Upload a PDF or text note in Study Materials and it becomes available here for document-grounded answers."
            action={
              <Button size="sm" variant="primary" to="/app/materials">
                Go to Study Materials
              </Button>
            }
            compact
          />
        )}
      </Dialog>

      {/* Generated quiz */}
      <Dialog
        open={Boolean(quiz)}
        onClose={() => setQuiz(null)}
        size="lg"
        title="Practice quiz"
        description={quiz ? `${quiz.topic} · ${quiz.difficulty}` : undefined}
        footer={
          <Button variant="primary" onClick={() => setQuiz(null)}>
            Close
          </Button>
        }
      >
        {quiz?.questions?.length ? (
          <div>
            {quiz.questions.map((question, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="sp-quiz__q" key={index}>
                <p className="sp-task__name">
                  {index + 1}. {question.question}
                </p>
                <ol className="sp-quiz__options">
                  {question.options.map((option, optionIndex) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={optionIndex}>
                      <Badge
                        size="sm"
                        tone={optionIndex === question.answer_index ? 'success' : 'neutral'}
                      >
                        {String.fromCharCode(65 + optionIndex)}
                      </Badge>{' '}
                      {option}
                    </li>
                  ))}
                </ol>
                {question.explanation ? (
                  <p className="sp-task__sub" style={{ marginTop: 'var(--sp-2)' }}>
                    {question.explanation}
                  </p>
                ) : null}
              </div>
            ))}
            <p className="sp-ai__disclaimer" style={{ marginTop: 'var(--sp-3)' }}>
              {quiz.disclaimer || AI_DISCLAIMER}
            </p>
          </div>
        ) : (
          <EmptyState
            icon="check"
            title="No questions were generated"
            description="Try a different course or add indexed documents for that subject."
            compact
          />
        )}
      </Dialog>

      {/* Generated flashcards */}
      <Dialog
        open={Boolean(cards)}
        onClose={() => setCards(null)}
        size="lg"
        title="Flashcards"
        description={cards ? cards.topic : undefined}
        footer={
          <Button variant="primary" onClick={() => setCards(null)}>
            Close
          </Button>
        }
      >
        {cards?.cards?.length ? (
          <div className="sp-stack">
            {cards.cards.map((card, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="sp-card__flip" key={index}>
                <p className="sp-task__name">{card.front}</p>
                <p className="sp-task__sub">{card.back}</p>
              </div>
            ))}
            <p className="sp-ai__disclaimer">{cards.disclaimer || AI_DISCLAIMER}</p>
          </div>
        ) : (
          <EmptyState
            icon="layers"
            title="No flashcards were generated"
            description="Try a different course or add indexed documents for that subject."
            compact
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this conversation?"
        message={
          deleting
            ? `"${deleting.title}" and all of its messages will be deleted permanently.`
            : ''
        }
        confirmLabel="Delete conversation"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
