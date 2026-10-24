/** /api/v1/student/notifications — the in-app notification centre. */

import { cleanParams, del, get, patch, post } from './api';

export const notificationsApi = {
  /** GET /student/notifications?is_read=&page= → paginated + unread_count. */
  list: (params = {}) =>
    get('/student/notifications', { params: cleanParams(params) }),

  /** GET /student/notifications/unread-count — polled by the top bar bell. */
  unreadCount: () => get('/student/notifications/unread-count'),

  markRead: (id) => patch(`/student/notifications/${id}/read`),
  markAllRead: () => post('/student/notifications/read-all'),
  remove: (id) => del(`/student/notifications/${id}`),

  /** GET /student/announcements — published announcements for this student. */
  announcements: () => get('/student/announcements'),
};

export default notificationsApi;
