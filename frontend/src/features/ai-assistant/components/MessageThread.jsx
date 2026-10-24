import { useEffect, useRef } from 'react';
import EmptyState from '../../../components/ui/EmptyState';
import Icon from '../../../components/ui/Icon';
import { formatTime } from '../../../utils/date';
import '../pages/assistant.css';

/**
 * Message thread. The assistant's latest answer is revealed progressively
 * (`streamingText`) so a long reply appears as it is typed out rather than
 * landing all at once; the full text is already stored server side.
 */
export default function MessageThread({
  messages = [],
  streamingText,
  streamingDone = true,
  pending = false,
  emptyAction,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, streamingText, pending]);

  if (!messages.length && !pending) {
    return (
      <div className="sp-ai__thread">
        <EmptyState
          icon="sparkle"
          title="Ask your first question"
          description="Explain a topic, summarise a chapter, break a large task into steps, or ask about one of your own documents."
          action={emptyAction}
          compact
        />
        <span ref={endRef} />
      </div>
    );
  }

  const lastIndex = messages.length - 1;

  return (
    <div className="sp-ai__thread" aria-live="polite">
      {messages.map((message, index) => {
        const isLastAssistant =
          index === lastIndex && message.role === 'assistant' && streamingText !== null;
        const content = isLastAssistant ? streamingText : message.content;
        return (
          <article className={`sp-msg sp-msg--${message.role}`} key={message.id ?? index}>
            <span className="sp-msg__avatar">
              <Icon name={message.role === 'user' ? 'users' : 'sparkle'} size={15} />
            </span>
            <div className="sp-msg__bubble">
              {content}
              {isLastAssistant && !streamingDone ? (
                <span className="sp-msg__caret" aria-hidden="true" />
              ) : null}
              {message.sources?.length && (!isLastAssistant || streamingDone) ? (
                <Citations sources={message.sources} />
              ) : null}
              {message.created_at ? (
                <span className="sp-msg__time">{formatTime(message.created_at)}</span>
              ) : null}
            </div>
          </article>
        );
      })}

      {pending ? (
        <article className="sp-msg sp-msg--assistant">
          <span className="sp-msg__avatar">
            <Icon name="sparkle" size={15} />
          </span>
          <div className="sp-msg__bubble">
            Searching your authorised material and composing an answer
            <span className="sp-msg__caret" aria-hidden="true" />
          </div>
        </article>
      ) : null}

      <span ref={endRef} />
    </div>
  );
}

/** Retrieved chunks the answer was grounded in (PRD 3.9). */
function Citations({ sources }) {
  return (
    <div className="sp-cites">
      <p className="sp-cites__label">Sources</p>
      {sources.map((source, index) => (
        <div
          className="sp-cite"
          key={`${source.resource_id}-${source.chunk_index ?? index}`}
        >
          <span className="sp-cite__index">[{index + 1}]</span>
          <div>
            <strong>{source.title}</strong>
            {source.page_number ? <span> · page {source.page_number}</span> : null}
            {typeof source.score === 'number' ? (
              <span> · relevance {source.score.toFixed(2)}</span>
            ) : null}
            {source.snippet ? (
              <p className="sp-cite__snippet">{source.snippet}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
