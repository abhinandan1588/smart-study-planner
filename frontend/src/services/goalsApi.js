/** /api/v1/student/goals and /student/achievements. */

import { cleanParams, del, get, patch, post } from './api';

export const goalsApi = {
  /** GET /student/goals?status= → goals with recomputed current_value. */
  list: (params = {}) => get('/student/goals', { params: cleanParams(params) }),

  get: (id) => get(`/student/goals/${id}`),
  create: (payload) => post('/student/goals', payload),
  update: (id, payload) => patch(`/student/goals/${id}`, payload),
  remove: (id) => del(`/student/goals/${id}`),

  /** POST /student/goals/:id/progress — asks the server to recompute. */
  refreshProgress: (id, payload = {}) => post(`/student/goals/${id}/progress`, payload),

  /** GET /student/achievements → { earned, available } */
  achievements: () => get('/student/achievements'),
  evaluateAchievements: () => post('/student/achievements/evaluate'),
};

export default goalsApi;
