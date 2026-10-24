import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import PageLoader from '../../../components/common/PageLoader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import MetricTile from '../../../components/ui/MetricTile';
import ProgressBar from '../../../components/ui/ProgressBar';
import ProgressRing from '../../../components/ui/ProgressRing';
import { useToast } from '../../../components/ui/ToastProvider';
import TaskDialog from '../../planner/components/TaskDialog';
import useApi from '../../../hooks/useApi';
import { focusApi } from '../../../services/focusApi';
import { studentApi } from '../../../services/studentApi';
import { formatDate, formatLongDate, formatTime, relativeFromNow } from '../../../utils/date';
import { formatMinutes, formatPercent } from '../../../utils/format';
import { PRIORITY_LABELS, labelFor, statusTone } from '../../../utils/constants';
import './dashboard.css';

/**
 * Student dashboard — every element of PRD 3.2, all of it from
 * `GET /api/v1/student/dashboard`, which computes each number from stored rows.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [taskOpen, setTaskOpen] = useState(false);
  const [startingFocus, setStartingFocus] = useState(false);

  const fetchDashboard = useCallback(() => studentApi.dashboard(), []);
  const { data, error, loading, reload } = useApi(fetchDashboard);

  async function startFocusSession() {
    setStartingFocus(true);
    try {
      await focusApi.start({ mode: 'pomodoro' });
      navigate('/app/focus');
    } catch (caught) {
      // A session is already running: the timer page recovers it from the server.
      if (caught.code === 'CONFLICT' || caught.status === 409) {
        navigate('/app/focus');
      } else {
        toast.apiError(caught, 'Could not start the timer');
      }
    } finally {
      setStartingFocus(false);
    }
  }

  if (loading && !data) return <PageLoader tiles={4} cards={3} />;
  if (error && !data) {
    return (
      <div className="sp-page">
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={reload} boxed />
      </div>
    );
  }
  if (!data) return null;

  const today = data.today || {};
  const week = data.week || {};
  const tasks = data.tasks || {};
  const syllabus = data.syllabus || {};
  const streak = data.streak || {};
  const continueTopic = data.continue_topic;

  return (
    <div className="sp-page">
      <PageHeader
        title={data.greeting || 'Dashboard'}
        actions={
          <div className="sp-dash__quick">
            <Button variant="primary" iconLeft="plus" onClick={() => setTaskOpen(true)}>
              Add task
            </Button>
            <Button
              iconLeft="timer"
              loading={startingFocus}
              onClick={startFocusSession}
            >
              Start focus session
            </Button>
            <Button iconLeft="calendar" to="/app/planner">
              Timetable
            </Button>
          </div>
        }
      >
        <p className="sp-dash__date">
          {formatLongDate(data.date)}
          {data.timezone ? ` · ${data.timezone}` : ''}
          {data.unread_notifications > 0 ? (
            <>
              {' · '}
              <Link to="/app/notifications">
                {data.unread_notifications} unread{' '}
                {data.unread_notifications === 1 ? 'reminder' : 'reminders'}
              </Link>
            </>
          ) : null}
        </p>
      </PageHeader>

      {/* Compact metric row — label + value + one supporting line each. */}
      <div className="sp-grid sp-grid--4">
        <MetricTile
          icon="timer"
          label="Studied today"
          value={formatMinutes(today.studied_minutes)}
          sub={`Planned ${formatMinutes(today.planned_minutes)}`}
          tone={today.studied_minutes > 0 ? 'success' : 'neutral'}
        />
        <MetricTile
          icon="check"
          label="Tasks"
          value={`${tasks.completed || 0} done`}
          sub={`${tasks.pending || 0} pending · ${tasks.overdue || 0} overdue`}
          tone={tasks.overdue > 0 ? 'warning' : 'neutral'}
        />
        <MetricTile
          icon="flame"
          label="Study streak"
          value={`${data.streak_days || 0} ${data.streak_days === 1 ? 'day' : 'days'}`}
          sub={`Longest ${streak.longest || 0} · ${streak.active_days || 0} active days`}
          tone={data.streak_days > 0 ? 'primary' : 'neutral'}
        />
        <MetricTile
          icon="syllabus"
          label="Syllabus complete"
          value={formatPercent(data.syllabus_completion_percent)}
          sub={`${syllabus.completed_topics || 0} of ${syllabus.total_topics || 0} topics`}
          tone="neutral"
        />
      </div>

      <div className="sp-dash__cols">
        <div className="sp-dash__col">
          {/* Daily target progress + planned vs actual */}
          <Card
            title="Today's plan"
            subtitle="Planned against actual time, from your stored sessions and focus blocks"
            actions={
              <Button size="sm" variant="ghost" iconLeft="refresh" onClick={reload}>
                Refresh
              </Button>
            }
          >
            <div className="sp-dash__today">
              <ProgressRing
                value={today.studied_minutes || 0}
                max={today.target_minutes || 1}
                size={116}
                label={formatPercent(today.percent)}
                caption="of daily target"
                tone={today.percent >= 100 ? 'success' : 'primary'}
              />
              <div className="sp-dash__todaystats">
                <div className="sp-dash__statrow">
                  <div className="sp-dash__stat">
                    <span className="sp-dash__statlabel">Planned study hours</span>
                    <span className="sp-dash__statvalue">
                      {formatMinutes(today.planned_minutes)}
                    </span>
                  </div>
                  <div className="sp-dash__stat">
                    <span className="sp-dash__statlabel">Actual time studied</span>
                    <span className="sp-dash__statvalue">
                      {formatMinutes(today.studied_minutes)}
                    </span>
                  </div>
                  <div className="sp-dash__stat">
                    <span className="sp-dash__statlabel">Focus time completed</span>
                    <span className="sp-dash__statvalue">
                      {formatMinutes(data.focus_minutes_today)}
                    </span>
                  </div>
                  <div className="sp-dash__stat">
                    <span className="sp-dash__statlabel">Sessions today</span>
                    <span className="sp-dash__statvalue">
                      {today.sessions_completed || 0}/{today.sessions_total || 0}
                    </span>
                  </div>
                </div>
                <ProgressBar
                  value={week.studied_minutes || 0}
                  max={week.target_minutes || 1}
                  showLabel
                  label={`This week · ${formatMinutes(week.studied_minutes)} of ${formatMinutes(
                    week.target_minutes,
                  )}`}
                  tone={week.percent >= 100 ? 'success' : 'primary'}
                />
              </div>
            </div>

            {continueTopic ? (
              <div className="sp-dash__continue" style={{ marginTop: 'var(--sp-4)' }}>
                <div>
                  <p className="sp-dash__statlabel">Continue where you left off</p>
                  <p className="sp-dash__itemtitle">{continueTopic.title}</p>
                  <p className="sp-dash__itemmeta">
                    {continueTopic.subject_name || 'Syllabus'} ·{' '}
                    {formatMinutes(continueTopic.time_spent_minutes)} of{' '}
                    {formatMinutes(continueTopic.estimated_minutes)} spent
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  iconLeft="chevronRight"
                  to={
                    continueTopic.course_id
                      ? `/app/syllabus/${continueTopic.course_id}?topic=${continueTopic.topic_id}`
                      : '/app/syllabus'
                  }
                >
                  Continue topic
                </Button>
              </div>
            ) : null}
          </Card>

          {/* Upcoming study sessions */}
          <Card
            title="Upcoming study sessions"
            subtitle="Next planned sessions from your timetable"
            actions={
              <Button size="sm" variant="ghost" to="/app/planner">
                Open timetable
              </Button>
            }
          >
            {data.upcoming_sessions?.length ? (
              <ul className="sp-dash__list">
                {data.upcoming_sessions.map((session) => (
                  <li className="sp-dash__item" key={session.id}>
                    <Icon name="calendar" size={16} />
                    <div className="sp-dash__itembody">
                      <span className="sp-dash__itemtitle">{session.title}</span>
                      <span className="sp-dash__itemmeta">
                        {formatDate(session.start_at)} · {formatTime(session.start_at)}–
                        {formatTime(session.end_at)} ·{' '}
                        {formatMinutes(session.planned_minutes)}
                        {session.course_title ? ` · ${session.course_title}` : ''}
                      </span>
                    </div>
                    <div className="sp-dash__itemaside">
                      <span className="sp-dash__time">
                        {relativeFromNow(session.start_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="calendar"
                title="No upcoming sessions"
                description="Schedule a session or generate a plan from your syllabus and availability."
                action={
                  <Button variant="primary" size="sm" to="/app/planner">
                    Plan my week
                  </Button>
                }
                compact
              />
            )}
          </Card>

          {/* Recently accessed courses */}
          <Card
            title="Recent courses"
            subtitle="Courses you opened most recently"
            actions={
              <Button size="sm" variant="ghost" to="/app/courses">
                My courses
              </Button>
            }
          >
            {data.recent_courses?.length ? (
              <div className="sp-dash__courses">
                {data.recent_courses.map((course) => (
                  <article className="sp-dash__course" key={course.enrollment_id}>
                    <div className="sp-dash__coursehead">
                      <Link
                        className="sp-dash__itemtitle"
                        to={`/app/syllabus/${course.id}`}
                      >
                        {course.title}
                      </Link>
                      <Badge tone={statusTone(course.category)} size="sm">
                        {labelFor({}, course.category)}
                      </Badge>
                    </div>
                    <ProgressBar
                      value={course.progress?.completion_percent || 0}
                      showLabel
                      label={`${course.progress?.completed_topics || 0}/${
                        course.progress?.total_topics || 0
                      } topics`}
                    />
                    <span className="sp-dash__itemmeta">
                      {course.last_accessed_at
                        ? `Opened ${relativeFromNow(course.last_accessed_at)}`
                        : 'Not opened yet'}
                      {course.target_completion_date
                        ? ` · target ${formatDate(course.target_completion_date)}`
                        : ''}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="courses"
                title="No courses yet"
                description="Browse the published catalogue and enroll to start tracking a syllabus."
                action={
                  <Button variant="primary" size="sm" to="/app/courses/browse">
                    Browse courses
                  </Button>
                }
                compact
              />
            )}
          </Card>
        </div>

        <div className="sp-dash__col">
          {/* Active goals */}
          <Card
            title="Active goals"
            subtitle="Progress recomputed by the server from stored activity"
            actions={
              <Button size="sm" variant="ghost" to="/app/goals">
                All goals
              </Button>
            }
          >
            {data.active_goals?.length ? (
              <ul className="sp-dash__list">
                {data.active_goals.map((goal) => (
                  <li className="sp-dash__goal" key={goal.id}>
                    <div className="sp-dash__goalhead">
                      <span className="sp-dash__itemtitle">{goal.title}</span>
                      <Badge tone={statusTone(goal.status)} size="sm">
                        {labelFor({}, goal.status)}
                      </Badge>
                    </div>
                    <ProgressBar
                      value={goal.progress_percent}
                      showLabel
                      label={`${goal.current_value} / ${goal.target_value} ${
                        goal.unit || ''
                      }`}
                      tone={goal.status === 'overdue' ? 'danger' : 'primary'}
                    />
                    <span className="sp-dash__itemmeta">
                      Deadline {formatDate(goal.deadline)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="target"
                title="No active goals"
                description="Set a target — topics, weekly hours or a streak — and the server tracks it for you."
                action={
                  <Button variant="primary" size="sm" to="/app/goals">
                    Create a goal
                  </Button>
                }
                compact
              />
            )}
          </Card>

          {/* Upcoming deadlines */}
          <Card title="Upcoming deadlines" subtitle="Next 14 days">
            {data.upcoming_deadlines?.length ? (
              <ul className="sp-dash__list">
                {data.upcoming_deadlines.map((item) => (
                  <li className="sp-dash__item" key={`${item.kind}-${item.id}`}>
                    <Icon
                      name={
                        item.kind === 'task'
                          ? 'check'
                          : item.kind === 'goal'
                            ? 'target'
                            : 'courses'
                      }
                      size={16}
                    />
                    <div className="sp-dash__itembody">
                      <Link className="sp-dash__itemtitle" to={item.link || '#'}>
                        {item.title}
                      </Link>
                      <span className="sp-dash__itemmeta">
                        {formatDate(item.date)}
                        {item.priority
                          ? ` · ${labelFor(PRIORITY_LABELS, item.priority)} priority`
                          : ''}
                      </span>
                    </div>
                    <Badge
                      tone={
                        item.days_left < 0
                          ? 'danger'
                          : item.days_left <= 2
                            ? 'warning'
                            : 'neutral'
                      }
                      size="sm"
                    >
                      {item.days_left < 0
                        ? `${Math.abs(item.days_left)}d overdue`
                        : item.days_left === 0
                          ? 'Today'
                          : `${item.days_left}d`}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="calendar"
                title="Nothing due soon"
                description="Tasks, goal deadlines and course target dates land here."
                compact
              />
            )}
          </Card>

          {/* Announcements and reminders */}
          <Card
            title="Announcements"
            subtitle="Published for you or your enrolled courses"
            actions={
              <Button size="sm" variant="ghost" to="/app/notifications">
                Notifications
              </Button>
            }
          >
            {data.announcements?.length ? (
              <ul className="sp-dash__list">
                {data.announcements.map((announcement) => (
                  <li className="sp-dash__announce" key={announcement.id}>
                    <p className="sp-dash__announcetitle">{announcement.title}</p>
                    <p className="sp-dash__announcebody">{announcement.body}</p>
                    <p className="sp-dash__itemmeta">
                      {announcement.course_title
                        ? `${announcement.course_title} · `
                        : ''}
                      {announcement.publish_at
                        ? relativeFromNow(announcement.publish_at)
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="megaphone"
                title="No announcements"
                description="Platform and course announcements appear here."
                compact
              />
            )}
          </Card>
        </div>
      </div>

      <TaskDialog
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        onSaved={() => {
          setTaskOpen(false);
          toast.success('Task created');
          reload();
        }}
      />
    </div>
  );
}
