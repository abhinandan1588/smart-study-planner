import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS } from '../../utils/constants';
import './charts.css';

const AXIS = {
  stroke: 'var(--c-border-strong)',
  tick: { fill: 'var(--c-text-muted)', fontSize: 11 },
};

/**
 * Line chart card used for daily study hours and cumulative syllabus growth.
 *
 * series: [{ key, name, color?, dashed? }]
 * data:   [{ [xKey]: label, [key]: number }]
 */
export default function LineChartCard({
  title,
  subtitle,
  actions,
  data = [],
  series = [],
  xKey = 'date',
  height = 240,
  formatValue = (value) => value,
  formatAxisValue,
  formatLabel = (value) => value,
  emptyTitle = 'No data for this range',
  emptyDescription = 'Study activity will appear here once sessions are recorded.',
  emptyAction,
}) {
  const hasData = data.length > 0;
  return (
    <Card title={title} subtitle={subtitle} actions={actions}>
      {hasData ? (
        <div className="sp-chart">
          <div className="sp-chart__plot" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey={xKey}
                  stroke={AXIS.stroke}
                  tick={AXIS.tick}
                  tickFormatter={formatLabel}
                  minTickGap={24}
                />
                <YAxis
                  stroke={AXIS.stroke}
                  tick={AXIS.tick}
                  tickFormatter={formatAxisValue || ((value) => value)}
                  width={56}
                  allowDecimals={false}
                />
                <Tooltip
                  content={
                    <ChartTooltip formatValue={formatValue} formatLabel={formatLabel} />
                  }
                />
                {series.map((item, index) => (
                  <Line
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    name={item.name}
                    stroke={item.color || CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    strokeDasharray={item.dashed ? '5 4' : undefined}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {series.length > 1 ? (
            <ul className="sp-chart__legend">
              {series.map((item, index) => (
                <li className="sp-chart__legenditem" key={item.key}>
                  <span
                    className="sp-chart__swatch"
                    style={{
                      background: item.color || CHART_COLORS[index % CHART_COLORS.length],
                    }}
                    aria-hidden="true"
                  />
                  {item.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon="analytics"
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          compact
        />
      )}
    </Card>
  );
}
