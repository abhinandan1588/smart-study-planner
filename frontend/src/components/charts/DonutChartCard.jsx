import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from '../../utils/constants';
import { formatNumber } from '../../utils/format';
import './charts.css';

/**
 * Donut for completed / in progress / not started topics.
 * data: [{ name, value, color? }]
 */
export default function DonutChartCard({
  title,
  subtitle,
  actions,
  data = [],
  height = 220,
  centreValue,
  centreLabel,
  formatValue = (value) => formatNumber(value),
  emptyTitle = 'No topics yet',
  emptyDescription = 'Enroll in a course to start tracking topic completion.',
  emptyAction,
}) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  if (total <= 0) {
    return (
      <Card title={title} subtitle={subtitle} actions={actions}>
        <EmptyState
          icon="syllabus"
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
      <div className="sp-chart sp-donut">
        <div className="sp-chart__plot" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="62%"
                outerRadius="90%"
                paddingAngle={2}
                stroke="var(--c-surface)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((item, index) => (
                  <Cell
                    key={item.name}
                    fill={item.color || CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
            </PieChart>
          </ResponsiveContainer>
          {centreValue !== undefined ? (
            <div className="sp-donut__centre" style={{ height }}>
              <span className="sp-donut__value">{centreValue}</span>
              {centreLabel ? (
                <span className="sp-donut__label">{centreLabel}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <ul className="sp-chart__legend">
          {data.map((item, index) => (
            <li className="sp-chart__legenditem" key={item.name}>
              <span
                className="sp-chart__swatch"
                style={{
                  background: item.color || CHART_COLORS[index % CHART_COLORS.length],
                }}
                aria-hidden="true"
              />
              {item.name} · {formatNumber(item.value)}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
