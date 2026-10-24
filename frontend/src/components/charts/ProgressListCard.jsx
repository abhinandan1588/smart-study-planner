import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ProgressBar from '../ui/ProgressBar';
import './charts.css';

/**
 * Progress bars for syllabus completion by course (PRD 3.8).
 * items: [{ id, label, percent, meta, tone }]
 */
export default function ProgressListCard({
  title,
  subtitle,
  actions,
  items = [],
  emptyTitle = 'No enrolled courses',
  emptyDescription = 'Enroll in a course to see syllabus completion here.',
  emptyAction,
}) {
  if (!items.length) {
    return (
      <Card title={title} subtitle={subtitle} actions={actions}>
        <EmptyState
          icon="courses"
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          compact
        />
      </Card>
    );
  }
  return (
    <Card title={title} subtitle={subtitle} actions={actions}>
      <ul className="sp-progresslist">
        {items.map((item) => (
          <li className="sp-progresslist__item" key={item.id}>
            <div className="sp-progresslist__head">
              <span className="sp-progresslist__title">{item.label}</span>
              <span className="sp-progresslist__meta">{item.meta}</span>
            </div>
            <ProgressBar
              value={item.percent}
              tone={item.tone || 'primary'}
              label={`${item.label} completion`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
