import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import Select from '../../../components/ui/Select';
import Tabs from '../../../components/ui/Tabs';
import BarChartCard from '../../../components/charts/BarChartCard';
import DonutChartCard from '../../../components/charts/DonutChartCard';
import HeatmapCalendar from '../../../components/charts/HeatmapCalendar';
import LineChartCard from '../../../components/charts/LineChartCard';
import ProgressListCard from '../../../components/charts/ProgressListCard';
import useApi from '../../../hooks/useApi';
import { analyticsApi } from '../../../services/analyticsApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate } from '../../../utils/date';
import { formatMinutes, formatNumber, formatPercent } from '../../../utils/format';

import './analytics.css';

const RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 12 months' },
];

const PERIODS = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const hoursAxis = (value) => `${Math.round((Number(value) || 0) / 60)}h`;
const shortDate = (value) => formatDate(value, { year: undefined });

/**
 * Progress analytics (PRD 3.8). Every series comes from
 * `GET /api/v1/student/analytics`, which aggregates the caller's stored rows;
 * empty datasets render as empty states rather than filler values.
 */
export default function AnalyticsPage() {
  const [range, setRange] = useState('30d');
  const [courseId, setCourseId] = useState('');
  const [period, setPeriod] = useState('week');
  const [courses, setCourses] = useState([]);

  const fetchAnalytics = useCallback(
    () => analyticsApi.overview({ range, course_id: courseId }),
    [range, courseId],
  );
  const { data, error, loading, reload } = useApi(fetchAnalytics);

  const fetchSummary = useCallback(
    () => analyticsApi.summary({ period }),
    [period],
  );
  const { data: summary } = useApi(fetchSummary);

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

  if (loading && !data) return <PageLoader tiles={4} cards={3} />;
  if (error && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Progress Analytics" />
        <ErrorState error={error} onRetry={reload} boxed />
      </div>
    );
  }
  if (!data) return null;

  const totalMinutes = (data.daily_study || []).reduce(
    (sum, point) => sum + (point.minutes || 0),
    0,
  );
  const activeDays = (data.daily_study || []).filter((point) => point.minutes > 0)
    .length;
  const donut = data.topics_donut || {};
  const selected = summary?.selected;

  return (
    <div className="sp-page">
      <PageHeader
        title="Progress Analytics"
        description="Study time, syllabus growth, consistency and plan adherence, all from your stored records."
        actions={
          <Button iconLeft="refresh" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="sp-an__filters">
          <Select
            label="Range"
            options={RANGE_OPTIONS}
            value={range}
            onChange={(event) => setRange(event.target.value)}
          />
          <Select
            label="Course"
            placeholder="All enrolled courses"
            options={courses}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          />
          <span className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            {formatDate(data.range?.from)} – {formatDate(data.range?.to)} ·{' '}
            {data.range?.days} days
          </span>
        </div>
      </Card>

      <div className="sp-grid sp-grid--4">
        <MetricTile
          label="Study time in range"
          value={formatMinutes(totalMinutes)}
          sub={`${activeDays} active days`}
          icon="timer"
        />
        <MetricTile
          label="Focus sessions"
          value={data.focus_totals?.sessions || 0}
          sub={`${formatMinutes(data.focus_totals?.minutes)} · ${
            data.focus_totals?.cycles || 0
          } cycles`}
          icon="flame"
        />
        <MetricTile
          label="Streak"
          value={`${data.streak?.current || 0} days`}
          sub={`Longest ${data.streak?.longest || 0}`}
          icon="analytics"
          tone={data.streak?.current > 0 ? 'primary' : 'neutral'}
        />
        <MetricTile
          label="Overdue tasks"
          value={data.overdue_tasks || 0}
          sub={`${data.upcoming_deadlines?.length || 0} deadlines in 14 days`}
          icon="warning"
          tone={data.overdue_tasks > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {data.insights?.length ? (
        <Card title="Insights" subtitle="Derived from the records above">
          <div className="sp-an__insights">
            {data.insights.map((insight, index) => (
              <div
                className={`sp-an__insight sp-an__insight--${insight.severity || 'info'}`}
                key={`${insight.type}-${index}`}
              >
                <span>{insight.message}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Daily study hours — line chart */}
      <LineChartCard
        title="Daily study time"
        subtitle="Completed session time plus focus time, per day"
        data={data.daily_study || []}
        series={[
          { key: 'minutes', name: 'Total studied' },
          { key: 'focus_minutes', name: 'Focus time' },
        ]}
        xKey="date"
        height={260}
        formatValue={(value) => formatMinutes(value)}
        formatAxisValue={hoursAxis}
        formatLabel={shortDate}
        emptyDescription="Complete a study session or focus block and this chart starts filling in."
      />

      <div className="sp-an__charts">
        {/* Study time by subject — bar chart */}
        <BarChartCard
          title="Study time by subject"
          subtitle="From completed sessions linked to a subject"
          data={data.by_subject || []}
          series={[{ key: 'minutes', name: 'Minutes' }]}
          xKey="subject"
          layout="vertical"
          height={260}
          formatValue={(value) => formatMinutes(value)}
          formatAxisValue={hoursAxis}
          emptyTitle="No subject-linked sessions yet"
          emptyDescription="Link a study session to a course and topic to see the split by subject."
        />

        {/* Completed vs pending topics — donut */}
        <DonutChartCard
          title="Topics completed vs pending"
          subtitle={
            courseId ? 'Selected course' : 'Across every enrolled course'
          }
          data={[
            { name: 'Completed', value: donut.completed || 0, color: 'var(--c-chart-2)' },
            {
              name: 'In progress',
              value: donut.in_progress || 0,
              color: 'var(--c-chart-3)',
            },
            {
              name: 'Not started',
              value: donut.not_started || 0,
              color: 'var(--c-border-strong)',
            },
          ]}
          centreValue={formatNumber(donut.total || 0)}
          centreLabel="topics"
          height={240}
        />
      </div>

      <div className="sp-an__charts">
        {/* Planned vs actual — comparison chart */}
        <BarChartCard
          title="Planned vs actual study time"
          subtitle="Planned session minutes against what you actually recorded"
          data={data.planned_vs_actual || []}
          series={[
            { key: 'planned_minutes', name: 'Planned' },
            { key: 'actual_minutes', name: 'Actual', color: 'var(--c-chart-2)' },
          ]}
          xKey="date"
          height={240}
          formatValue={(value) => formatMinutes(value)}
          formatAxisValue={hoursAxis}
          formatLabel={shortDate}
          emptyTitle="Nothing planned in this range"
          emptyDescription="Schedule sessions in the timetable to compare plan against reality."
        />

        {/* Tasks completed vs planned */}
        <BarChartCard
          title="Tasks due vs completed"
          subtitle="Tasks due each day against tasks actually completed"
          data={data.tasks_planned_vs_completed || []}
          series={[
            { key: 'planned', name: 'Due' },
            { key: 'completed', name: 'Completed', color: 'var(--c-chart-2)' },
          ]}
          xKey="date"
          height={240}
          formatValue={(value) => formatNumber(value)}
          formatLabel={shortDate}
          emptyTitle="No tasks in this range"
          emptyDescription="Add a task with a due date to compare plan against completion."
        />
      </div>

      <div className="sp-an__charts">
        {/* Syllabus completion over time */}
        <LineChartCard
          title="Syllabus completion over time"
          subtitle="Cumulative completed topics"
          data={data.syllabus_over_time || []}
          series={[
            { key: 'completed_topics', name: 'Completed topics', color: 'var(--c-chart-2)' },
          ]}
          xKey="date"
          height={240}
          formatValue={(value) => `${formatNumber(value)} topics`}
          formatLabel={shortDate}
          emptyTitle="No completed topics yet"
          emptyDescription="Mark a topic completed in the syllabus and this line starts to climb."
        />

        {/* Focus sessions completed */}
        <BarChartCard
          title="Focus sessions"
          subtitle="Sessions started against sessions that reached the target"
          data={data.focus_sessions || []}
          series={[
            { key: 'count', name: 'Started' },
            { key: 'completed', name: 'Completed', color: 'var(--c-chart-2)' },
          ]}
          xKey="date"
          height={240}
          formatValue={(value) => formatNumber(value)}
          formatLabel={shortDate}
          emptyTitle="No focus sessions in this range"
          emptyDescription="Run a focus block from the Focus Timer page."
        />
      </div>

      {/* Study consistency heatmap */}
      <HeatmapCalendar
        title="Study consistency"
        data={data.consistency_heatmap || []}
        streak={data.streak}
      />

      <div className="sp-an__charts">
        {/* Syllabus completion by course — progress bars */}
        <ProgressListCard
          title="Syllabus completion by course"
          subtitle="Unweighted topic completion per enrolled course"
          items={(data.course_completion || []).map((item) => ({
            id: item.course_id,
            label: item.course || `Course ${item.course_id}`,
            percent: item.percent,
            meta: `${item.completed_topics}/${item.total_topics} topics${
              item.target_completion_date
                ? ` · target ${formatDate(item.target_completion_date)}`
                : ''
            }`,
            tone: item.percent >= 100 ? 'success' : 'primary',
          }))}
        />

        <Card
          title="Weekly and monthly summary"
          subtitle="Totals computed from your stored activity"
          actions={
            <Tabs
              items={PERIODS}
              active={period}
              onChange={setPeriod}
              ariaLabel="Summary period"
            />
          }
        >
          {selected ? (
            <div className="sp-stack">
              <ProgressBar
                value={selected.studied_minutes}
                max={selected.target_minutes || 1}
                showLabel
                label={`${formatMinutes(selected.studied_minutes)} of ${formatMinutes(
                  selected.target_minutes,
                )} target`}
                tone={selected.percent >= 100 ? 'success' : 'primary'}
              />
              <dl className="sp-deflist">
                <dt>Range</dt>
                <dd>
                  {formatDate(selected.from)} – {formatDate(selected.to)}
                </dd>
                <dt>Studied</dt>
                <dd>{formatMinutes(selected.studied_minutes)}</dd>
                <dt>Focus time</dt>
                <dd>{formatMinutes(selected.focus_minutes)}</dd>
                <dt>Planned</dt>
                <dd>{formatMinutes(selected.planned_minutes)}</dd>
                <dt>Sessions completed</dt>
                <dd>{selected.sessions_completed}</dd>
                <dt>Active days</dt>
                <dd>{selected.active_days}</dd>
                <dt>Target met</dt>
                <dd>{formatPercent(selected.percent)}</dd>
              </dl>
              {summary?.last_week && period === 'week' ? (
                <p className="sp-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  Last week: {formatMinutes(summary.last_week.studied_minutes)} over{' '}
                  {summary.last_week.active_days} active days.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon="analytics"
              title="No summary yet"
              description="Record some study time and the weekly summary appears here."
              compact
            />
          )}
        </Card>
      </div>

      <Card
        title="Approaching deadlines"
        subtitle="Tasks and goals due in the next 14 days"
      >
        {data.upcoming_deadlines?.length ? (
          <ul>
            {data.upcoming_deadlines.map((item) => (
              <li className="sp-an__deadline" key={`${item.kind}-${item.id}`}>
                <span>
                  <strong>{item.title}</strong>
                  <span className="sp-muted"> · {item.kind}</span>
                </span>
                <span className="sp-row">
                  <span className="sp-muted">{formatDate(item.date)}</span>
                  <Badge
                    size="sm"
                    tone={item.days_left <= 2 ? 'warning' : 'neutral'}
                  >
                    {item.days_left === 0 ? 'Today' : `${item.days_left}d`}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="calendar"
            title="Nothing due in the next two weeks"
            description="Task and goal deadlines show up here as they approach."
            compact
          />
        )}
      </Card>
    </div>
  );
}
