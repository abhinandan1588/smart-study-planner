/** /api/v1/student — dashboard, profile and enrollments. */

import { cleanParams, del, get, patch, post } from './api';

export const studentApi = {
  /** GET /student/dashboard — every metric computed from stored rows. */
  dashboard: () => get('/student/dashboard'),

  getProfile: () => get('/student/profile'),
  updateProfile: (payload) => patch('/student/profile', payload),
  changePassword: (currentPassword, newPassword) =>
    post('/student/profile/password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  listEnrollments: (params = {}) =>
    get('/student/enrollments', { params: cleanParams(params) }),
  enroll: (payload) => post('/student/enrollments', payload),
  updateEnrollment: (id, payload) => patch(`/student/enrollments/${id}`, payload),
  removeEnrollment: (id) => del(`/student/enrollments/${id}`),

  /** GET /student/announcements — published, unexpired, audience-filtered. */
  announcements: () => get('/student/announcements'),

  achievements: () => get('/student/achievements'),
  evaluateAchievements: () => post('/student/achievements/evaluate'),
};

export default studentApi;
