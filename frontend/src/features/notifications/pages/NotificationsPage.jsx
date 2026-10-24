import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import MetricTile from '../../../components/ui/MetricTile';
import Pagination from '../../../components/ui/Pagination';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import Tabs from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import usePagination from '../../../hooks/usePagination';
import { notificationsApi } from '../../../services/notificationsApi';
import { formatDateTime, relativeFromNow } from '../../../utils/date';
import {
  NOTIFICATION_TYPE_LABELS,
  labelFor,
  optionsFrom,
  statusTone,
} from '../../../utils/constants';
import './notifications.css';

const TYPE_ICONS = {
  session_upcoming: 'calendar',
  task_due: 'check',
  task_overdue: 'warning',
  revision_due: 'refresh',
  goal_deadline: 'target',
  announcement: 'megaphone',
  new_resource: 'folder',
  plan_change: 'calendar',
};

const TABS = [
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'All' },
  { key: 'announcements', label: 'Announcements' },
];

/**
 * Notification centre (PRD 3.11).
 *
 * `GET /api/v1/student/notifications` also generates any reminders that have
 * become due, guarded by a dedupe key so reloading never duplicates one.
 */
export default function NotificationsPage() {
  const toast = useToast();
  const pager = usePagination({ perPage: 20 });
  const [tab, setTab] = useState('unread');
  const [type, setType] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    pager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type]);

  const fetchNotifications = useCallback(() => {
    if (tab === 'announcements') return Promise.resolve(null);
    return notificationsApi.list({
      page: pager.page,
      per_page: pager.perPage,
      is_read: tab === 'unread' ? 'false' : '',
      type,
    });
  }, [tab, type, pager.page, pager.perPage]);

  const { data, error, loading, reload } = useApi(fetchNotifications, {
    onSuccess: (payload) => payload && pager.applyMeta(payload),
  });

  const fetchAnnouncements = useCallback(() => notificationsApi.announcements(), []);
  const {
    data: announcements,
    error: announcementsError,
    loading: announcementsLoading,
    reload: reloadAnnouncements,
  } = useApi(fetchAnnouncements);

  async function markRead(notification) {
    try {
      await notificationsApi.markRead(notification.id);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not mark it read');
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const result = await notificationsApi.markAllRead();
      toast.success(
        'All caught up',
        `${result.updated} ${result.updated === 1 ? 'notification' : 'notifications'} marked read.`,
      );
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not mark everything read');
    } finally {
      setMarkingAll(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await notificationsApi.remove(deleting.id);
      setDeleting(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not delete the notification');
    } finally {
      setRemoving(false);
    }
  }

  const unread = data?.unread_count ?? 0;
  const items = data?.items || [];

  return (
    <div className="sp-page">
      <PageHeader
        title="Notifications"
        description="Session reminders, task deadlines, revisions, goal dates and announcements."
        actions={
          <>
            <Button iconLeft="refresh" onClick={reload}>
              Check for new
            </Button>
            <Button
              variant="primary"
              iconLeft="check"
              loading={markingAll}
              disabled={unread === 0}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <div className="sp-grid sp-grid--3">
        <MetricTile
          label="Unread"
          value={unread}
          icon="bell"
          tone={unread > 0 ? 'primary' : 'neutral'}
        />
        <MetricTile label="Total" value={pager.meta.total || 0} icon="inbox" />
        <MetricTile
          label="Announcements"
          value={announcements?.total ?? '—'}
          icon="megaphone"
        />
      </div>

      <div className="sp-plan__toolbar">
        <Tabs items={TABS} active={tab} onChange={setTab} ariaLabel="Notification view" />
        {tab !== 'announcements' ? (
          <Select
            aria-label="Filter by type"
            placeholder="All types"
            options={optionsFrom(NOTIFICATION_TYPE_LABELS)}
            value={type}
            size="sm"
            onChange={(event) => setType(event.target.value)}
          />
        ) : null}
      </div>

      {tab === 'announcements' ? (
        <Card title="Announcements" subtitle="Published for you or your enrolled courses">
          {announcementsError ? (
            <ErrorState error={announcementsError} onRetry={reloadAnnouncements} compact />
          ) : announcementsLoading && !announcements ? (
            <Skeleton variant="text" count={5} />
          ) : announcements?.items?.length ? (
            <div>
              {announcements.items.map((item) => (
                <article className="sp-announce" key={item.id}>
                  <div className="sp-row sp-row--wrap">
                    <h3 className="sp-announce__title">{item.title}</h3>
                    {item.course_title ? (
                      <Badge tone="primary" size="sm">
                        {item.course_title}
                      </Badge>
                    ) : (
                      <Badge size="sm">All students</Badge>
                    )}
                  </div>
                  <p className="sp-announce__body">{item.body}</p>
                  <p className="sp-notif__meta">
                    Published{' '}
                    {item.publish_at ? relativeFromNow(item.publish_at) : 'recently'}
                    {item.expires_at
                      ? ` · expires ${formatDateTime(item.expires_at)}`
                      : ''}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="megaphone"
              title="No announcements"
              description="Platform and course announcements from administrators appear here."
              compact
            />
          )}
        </Card>
      ) : (
        <Card padded>
          {error ? (
            <ErrorState error={error} onRetry={reload} compact />
          ) : loading && !data ? (
            <Skeleton variant="text" count={6} />
          ) : items.length === 0 ? (
            <EmptyState
              icon="bell"
              title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}
              description={
                tab === 'unread'
                  ? 'You are all caught up. New reminders appear here as sessions, tasks and revisions come due.'
                  : 'Reminders are generated as your sessions, tasks, revisions and goal deadlines come due.'
              }
              action={
                tab === 'unread' ? (
                  <Button size="sm" onClick={() => setTab('all')}>
                    View all
                  </Button>
                ) : null
              }
              compact
            />
          ) : (
            <>
              <div className="sp-notif__list">
                {items.map((notification) => (
                  <div
                    className={`sp-notif ${notification.is_read ? '' : 'sp-notif--unread'}`}
                    key={notification.id}
                  >
                    <span className="sp-notif__icon">
                      <Icon
                        name={TYPE_ICONS[notification.type] || 'bell'}
                        size={16}
                      />
                    </span>
                    <div className="sp-notif__body">
                      <span className="sp-notif__title">{notification.title}</span>
                      {notification.body ? (
                        <span className="sp-notif__text">{notification.body}</span>
                      ) : null}
                      <span className="sp-notif__meta">
                        <Badge tone={statusTone(notification.type)} size="sm">
                          {labelFor(NOTIFICATION_TYPE_LABELS, notification.type)}
                        </Badge>
                        <span>{relativeFromNow(notification.created_at)}</span>
                        {notification.link ? (
                          <Link to={notification.link}>Open</Link>
                        ) : null}
                      </span>
                    </div>
                    <div className="sp-notif__actions">
                      {!notification.is_read ? (
                        <IconButton
                          icon="check"
                          size="sm"
                          label={`Mark "${notification.title}" read`}
                          onClick={() => markRead(notification)}
                        />
                      ) : null}
                      <IconButton
                        icon="trash"
                        size="sm"
                        label={`Delete "${notification.title}"`}
                        onClick={() => setDeleting(notification)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'var(--sp-4)' }}>
                <Pagination
                  page={pager.meta.page}
                  pages={pager.meta.pages}
                  total={pager.meta.total}
                  perPage={pager.meta.per_page}
                  onPageChange={pager.setPage}
                  label="notifications"
                />
              </div>
            </>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this notification?"
        message={deleting ? `"${deleting.title}" will be removed.` : ''}
        confirmLabel="Delete"
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
