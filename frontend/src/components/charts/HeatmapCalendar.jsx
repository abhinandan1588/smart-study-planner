import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../utils/date';
import { formatMinutes } from '../../utils/format';
import './charts.css';

const WEEKDAY_OFFSET = (iso) => {
  // Monday-first rows so the grid reads like the planner week view.
  const day = new Date(`${iso}T00:00:00`).getDay();
  return (day + 6) % 7;
};

/**
 * Study-consistency heatmap (PRD 3.8). A CSS grid rather than a chart library:
 * 7 rows (Mon–Sun), one column per week, level 0–4 straight from the API.
 *
 * data: [{ date: 'YYYY-MM-DD', minutes, level }]
 */
export default function HeatmapCalendar({
  title = 'Study consistency',
  subtitle,
  actions,
  data = [],
  streak,
}) {
  if (!data.length) {
    return (
      <Card title={title} subtitle={subtitle} actions={actions}>
        <EmptyState
          icon="flame"
          title="No activity recorded yet"
          description="Each square represents one day of study time. Complete a session or focus block to fill the first one."
          compact
        />
      </Card>
    );
  }

  // Pad the first week so the first square lands on the correct weekday row.
  const leading = WEEKDAY_OFFSET(data[0].date);
  const cells = [
    ...Array.from({ length: leading }, (_, index) => ({
      key: `pad-${index}`,
      padding: true,
    })),
    ...data.map((point) => ({ key: point.date, ...point })),
  ];

  const months = [];
  data.forEach((point) => {
    const label = formatDate(point.date, { month: 'short', day: undefined, year: undefined });
    if (months[months.length - 1] !== label) months.push(label);
  });

  const activeDays = data.filter((point) => point.minutes > 0).length;

  return (
    <Card
      title={title}
      subtitle={
        subtitle ||
        `${activeDays} active ${activeDays === 1 ? 'day' : 'days'} in this range`
      }
      actions={actions}
    >
      <div className="sp-heatmap">
        <div className="sp-heatmap__grid" role="img" aria-label="Daily study time heatmap">
          {cells.map((cell) =>
            cell.padding ? (
              <span
                key={cell.key}
                className="sp-heatmap__cell sp-heatmap__cell--empty"
                aria-hidden="true"
              />
            ) : (
              <span
                key={cell.key}
                className={`sp-heatmap__cell sp-heatmap__cell--l${cell.level || 0}`}
                title={`${formatDate(cell.date)} · ${formatMinutes(cell.minutes)}`}
              />
            ),
          )}
        </div>
        <div className="sp-heatmap__months">
          {months.slice(0, 6).map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
        <div className="sp-heatmap__scale">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`sp-heatmap__cell sp-heatmap__cell--l${level}`}
              aria-hidden="true"
            />
          ))}
          <span>More</span>
          {streak ? (
            <span style={{ marginLeft: 'auto' }}>
              Current streak {streak.current} · longest {streak.longest}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
