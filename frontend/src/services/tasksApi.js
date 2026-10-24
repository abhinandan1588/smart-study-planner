/** /api/v1/student/tasks — deadlines, priorities and statuses. */

import { cleanParams, del, get, patch, post } from './api';

export const tasksApi = {
  /** GET /student/tasks?status=&priority=&due_from=&due_to=&course_id=&q=&page= */
  list: (params = {}) => get('/student/tasks', { params: cleanParams(params) }),

  get: (id) => get(`/student/tasks/${id}`),
  create: (payload) => post('/student/tasks', payload),
  update: (id, payload) => patch(`/student/tasks/${id}`, payload),
  remove: (id) => del(`/student/tasks/${id}`),

  complete: (id) => patch(`/student/tasks/${id}`, { status: 'completed' }),
};

export default tasksApi;
