import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import BarChartCard from '../../../components/charts/BarChartCard';
import DonutChartCard from '../../../components/charts/DonutChartCard';
import LineChartCard from '../../../components/charts/LineChartCard';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import DataTable from '../../../components/ui/DataTable';
import ErrorState from '../../../components/ui/ErrorState';
import MetricTile from '../../../components/ui/MetricTile';
import Select from '../../../components/ui/Select';
import Tabs from '../../../components/ui/Tabs';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import { adminApi } from '../../../services/adminApi';
import { formatDate } from '../../../utils/date';
import { formatMinutes, formatNumber, titleCase } from '../../../utils/format';
import DateRangeFilter, { rangeForDays } from '../components/DateRangeFilter';
import '../admin.css';

/**
 * Reports and analytics (PRD 4.9) — `GET /api/v1/admin/reports?type=&from=&to=`,
 * `GET /admin/reports/summary` and `GET /admin/reports/export` (CSV).
 *
 * Every report is aggregate: the only per-student figures are counts an
 * administrator legitimately needs. The table columns come from the report's
 * own `columns` list, which is also what the CSV export uses, so the screen and
 * the download always agree.
 */

const REPORTS = {
  registrations: {
    label: 'Registrations',
    description: 'New student accounts per day, with verification and a running total.',
    chart: 'line',
    xKey: 'date',
    series: [
      { key: 'registrations', name: 'Registrations' },
      { key: 'verified', name: 'Verified' },
    ],
  },
  active_users: {
    label: 'Active users',
    description: 'Daily active students: a session, focus block or progress update.',
    chart: 'line',
    xKey: 'date',
    series: [{ key: 'daily_active', name: 'Daily active' }],
  },
  enrollments: {
    label: 'Enrollments',
    description: 'Enrollment counts per course and how many are still active.',
    chart: 'bar-h',
    xKey: 'course',
    series: [
      { key: 'active', name: 'Active' },
      { key: 'completed', name: 'Completed' },
      { key: 'dropped', name: 'Dropped' },
    ],
    stacked: true,
  },
  resources: {
    label: 'Resources',
    description: 'Most frequently downloaded study materials.',
    chart: 'bar-h',
    xKey: 'title',
    series: [{ key: 'downloads', name: 'Downloads' }],
  },
  engagement: {
    label: 'Engagement',
    description: 'Studied minutes, plan adherence and focus time per course.',
    chart: 'bar-h',
    xKey: 'course',
    series: [
      { key: 'studied_minutes', name: 'Studied minutes' },
      { key: 'planned_minutes', name: 'Planned minutes' },
    ],
  },
  progress: {
    label: 'Syllabus progress',
    description: 'Aggregate completion per course and subject.',
    chart: 'bar-h',
    xKey: 'subject',
    series: [
      { key: 'aggregate_completion_percent', name: 'Completion %' },
    ],
  },
  focus: {
    label: 'Focus sessions',
    description: 'Focus activity per day and how many sessions ran to completion.',
    chart: 'line',
    xKey: 'date',
    series: [
      { key: 'focus_minutes', name: 'Focus minutes' },
      { key: 'sessions', name: 'Sessions' },
    ],
  },
  notifications: {
    label: 'Notifications',
    description: 'Delivery and read rates per notification type.',
    chart: 'bar',
    xKey: 'notification_type',
    series: [
      { key: 'delivered', name: 'Delivered' },
      { key: 'read', name: 'Read' },
    ],
  },
  accounts: {
    label: 'Accounts',
    description: 'Account status mix, verification rate and status changes.',
    chart: 'line',
    xKey: 'date',
    series: [{ key: 'status_changes', name: 'Status changes' }],
  },
};

const TYPE_KEYS = Object.keys(REPORTS);
const ROWS_PER_PAGE = 15;

function cellValue(column, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (column.endsWith('_percent')) return `${value}%`;
  if (column.endsWith('_minutes')) return formatMinutes(value);
  if (column === 'size_bytes') return formatNumber(value);
  if (column === 'date') return formatDate(value);
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

export default function ReportsPage() {
  const toast = useToast();
  const [type, setType] = useState('registrations');
  const [range, setRange] = useState(() => rangeForDays(30));
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    adminApi.courses
      .list({ per_page: 100, sort: 'title' })
      .then((payload) =>
        setCourses(
          (payload.items || []).map((course) => ({
            value: String(course.id),
            label: `${course.title} (${course.status})`,
          })),
        ),
      )
      .catch(() => setCourses([]));
  }, []);

  const fetchReport = useCallback(
    () =>
      adminApi.reports.get({
        type,
        from: range.from,
        to: range.to,
        course_id: courseId,
      }),
    [type, range.from, range.to, courseId],
  );
  const { data, error, loading, reload } = useApi(fetchReport);

  const fetchSummary = useCallback(
    () =>
      adminApi.reports.summary({
        from: range.from,
        to: range.to,
        course_id: courseId,
      }),
    [range.from, range.to, courseId],
  );
  const { data: summary } = useApi(fetchSummary);

  const config = REPORTS[type];
  const series = data?.series || [];
  /** DataTable keys rows by value, so each report row carries its own key. */
  const tableRows = useMemo(
    () => series.map((row, index) => ({ ...row, __key: `${type}-${index}` })),
    [series, type],
  );

  /* The series is already fully loaded, so the row table paginates locally. */
  const [rowPage, setRowPage] = useState(1);
  useEffect(() => {
    setRowPage(1);
  }, [type, range.from, range.to, courseId]);
  const rowPages = Math.max(1, Math.ceil(tableRows.length / ROWS_PER_PAGE));
  const visibleRows = tableRows.slice(
    (rowPage - 1) * ROWS_PER_PAGE,
    rowPage * ROWS_PER_PAGE,
  );

  const columns = useMemo(
    () =>
      (data?.columns || []).map((column) => ({
        key: column,
        header: titleCase(column),
        align: column === 'date' || typeof series[0]?.[column] === 'string' ? undefined : 'right',
        render: (row) => cellValue(column, row[column]),
      })),
    [data, series],
  );

  async function exportCsv() {
    setExporting(true);
    try {
      await adminApi.reports.exportCsv({
        type,
        from: range.from,
        to: range.to,
        course_id: courseId,
      });
      toast.success('Export started', `${config.label} report downloaded as CSV.`);
    } catch (caught) {
      toast.apiError(caught, 'Could not export the report');
    } finally {
      setExporting(false);
    }
  }

  const shortDate = (value) => formatDate(value, { year: undefined });

  function renderChart() {
    if (!series.length) {
      return (
        <Card title={config.label} subtitle={config.description}>
          <p className="sp-muted">
            No rows for this range. Widen the date range or clear the course filter.
          </p>
        </Card>
      );
    }
    if (config.chart === 'line') {
      return (
        <LineChartCard
          title={config.label}
          subtitle={config.description}
          data={series}
          series={config.series}
          xKey={config.xKey}
          height={280}
          formatLabel={shortDate}
        />
      );
    }
    return (
      <BarChartCard
        title={config.label}
        subtitle={config.description}
        data={series}
        series={config.series}
        xKey={config.xKey}
        layout={config.chart === 'bar-h' ? 'vertical' : 'horizontal'}
        stacked={Boolean(config.stacked)}
        height={
          config.chart === 'bar-h' ? Math.max(220, series.length * 32) : 280
        }
        formatLabel={(value) => titleCase(String(value))}
      />
    );
  }

  const totals = data?.totals || {};

  return (
    <div className="sp-page">
      <PageHeader
        title="Reports & Analytics"
        description="Aggregate platform reporting with CSV export. No individual student's notes, uploads or AI conversations are included."
        actions={
          <Button
            variant="secondary"
            iconLeft="download"
            loading={exporting}
            disabled={!series.length}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      <Card title="Report filters">
        <div className="sp-stack">
          <DateRangeFilter value={range} onChange={setRange} disabled={loading} />
          <div className="sp-adm__filters">
            <Select
              label="Course"
              placeholder="All courses"
              options={courses}
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              hint="Applies to enrollment, engagement, progress and focus reports"
            />
            <div>
              <span className="sp-adm__dt">&nbsp;</span>
              <div className="sp-adm__filteractions">
                <Button variant="secondary" iconLeft="refresh" onClick={reload}>
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  disabled={!courseId}
                  onClick={() => setCourseId('')}
                >
                  Clear course
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Tabs
        items={TYPE_KEYS.map((key) => ({ key, label: REPORTS[key].label }))}
        active={type}
        onChange={setType}
        ariaLabel="Report type"
      />

      {error ? (
        <ErrorState error={error} onRetry={reload} boxed />
      ) : loading && !data ? (
        <>
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </>
      ) : data ? (
        <>
          <div className="sp-adm__metrics">
            {Object.entries(totals)
              .filter(([, value]) => typeof value !== 'object')
              .slice(0, 6)
              .map(([key, value]) => (
                <MetricTile
                  key={key}
                  label={titleCase(key)}
                  value={
                    key.endsWith('_percent')
                      ? `${value}%`
                      : key.endsWith('_minutes')
                        ? formatMinutes(value)
                        : formatNumber(value)
                  }
                  sub={`${formatDate(data.range.from)} → ${formatDate(data.range.to)}`}
                />
              ))}
          </div>

          {renderChart()}

          {type === 'accounts' ? (
            <DonutChartCard
              title="Account status mix"
              subtitle="Every student account, current state"
              data={[
                { name: 'Active', value: totals.active || 0 },
                { name: 'Suspended', value: totals.suspended || 0 },
                {
                  name: 'Pending verification',
                  value: totals.pending_verification || 0,
                },
              ]}
              centreValue={formatNumber(totals.total_students)}
              centreLabel="students"
              emptyTitle="No accounts yet"
              emptyDescription="Student accounts appear here once people register."
            />
          ) : null}

          <Card
            title={`${config.label} rows`}
            subtitle="The same columns the CSV export contains"
            padded={false}
          >
            <DataTable
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => row.__key}
              page={rowPage}
              pages={rowPages}
              total={tableRows.length}
              perPage={ROWS_PER_PAGE}
              onPageChange={setRowPage}
              itemLabel="rows"
              emptyTitle="No rows in this range"
              emptyDescription="Widen the date range or clear the course filter."
              emptyIcon="analytics"
              caption={`${config.label} report rows`}
            />
          </Card>

          {summary ? (
            <Card
              title="All reports at a glance"
              subtitle={`Totals for ${formatDate(summary.range.from)} → ${formatDate(
                summary.range.to,
              )}`}
            >
              <ul className="sp-adm__list">
                {TYPE_KEYS.map((key) => {
                  const block = summary.summary?.[key] || {};
                  const entries = Object.entries(block)
                    .filter(([, value]) => typeof value !== 'object')
                    .slice(0, 4);
                  return (
                    <li key={key}>
                      <span className="sp-adm__primary">
                        <span className="sp-adm__itemtitle">{REPORTS[key].label}</span>
                        <span className="sp-adm__itemmeta">
                          {entries
                            .map(
                              ([name, value]) =>
                                `${titleCase(name)}: ${
                                  name.endsWith('_percent')
                                    ? `${value}%`
                                    : name.endsWith('_minutes')
                                      ? formatMinutes(value)
                                      : formatNumber(value)
                                }`,
                            )
                            .join(' · ')}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={key === type ? 'primary' : 'ghost'}
                        onClick={() => setType(key)}
                      >
                        {key === type ? 'Viewing' : 'Open'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
