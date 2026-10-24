import {
  Bar,
  BarChart,
  CartesianGrid,
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
 * Bar chart card: study time by subject, planned vs actual, tasks planned vs
 * completed. `layout="vertical"` renders horizontal bars for long labels.
 */
export default function BarChartCard({
  title,
  subtitle,
  actions,
  data = [],
  series = [],
  xKey = 'name',
  layout = 'horizontal',
  height = 240,
  stacked = false,
  formatValue = (value) => value,
  formatAxisValue,
  formatLabel = (value) => value,
  emptyTitle = 'Nothing to chart yet',
  emptyDescription = 'This chart fills in as study sessions are completed.',
  emptyAction,
}) {
  const vertical = layout === 'vertical';
  if (!data.length) {
    return (
      <Card title={title} subtitle={subtitle} actions={actions}>
        <EmptyState
          icon="analytics"
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
      <div className="sp-chart">
        <div className="sp-chart__plot" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={layout}
              margin={
                vertical
                  ? { top: 4, right: 16, left: 8, bottom: 0 }
                  : { top: 4, right: 8, left: -12, bottom: 0 }
              }
              barGap={2}
            >
              <CartesianGrid
                stroke="var(--c-border)"
                strokeDasharray="3 3"
                vertical={vertical}
                horizontal={!vertical}
              />
              {vertical ? (
                <>
                  <XAxis
                    type="number"
                    stroke={AXIS.stroke}
                    tick={AXIS.tick}
                    tickFormatter={formatAxisValue || ((value) => value)}
                  />
                  <YAxis
                    type="category"
                    dataKey={xKey}
                    stroke={AXIS.stroke}
                    tick={AXIS.tick}
                    width={130}
                    tickFormatter={(value) =>
                      String(value).length > 20
                        ? `${String(value).slice(0, 19)}…`
                        : value
                    }
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey={xKey}
                    stroke={AXIS.stroke}
                    tick={AXIS.tick}
                    tickFormatter={formatLabel}
                    minTickGap={16}
                  />
                  <YAxis
                    stroke={AXIS.stroke}
                    tick={AXIS.tick}
                    width={56}
                    allowDecimals={false}
                    tickFormatter={formatAxisValue || ((value) => value)}
                  />
                </>
              )}
              <Tooltip
                cursor={{ fill: 'var(--c-surface-alt)' }}
                content={
                  <ChartTooltip formatValue={formatValue} formatLabel={formatLabel} />
                }
              />
              {series.map((item, index) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.name}
                  stackId={stacked ? 'a' : undefined}
                  fill={item.color || CHART_COLORS[index % CHART_COLORS.length]}
                  radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={vertical ? 18 : 28}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
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
    </Card>
  );
}
