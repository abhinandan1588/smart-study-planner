/** /api/v1/student — planned study sessions and smart-plan generation. */

import { cleanParams, del, get, patch, post } from './api';

export const timetableApi = {
  /** GET /student/study-sessions?from=&to=&view=day|week|month → sessions + conflicts */
  listSessions: (params = {}) =>
    get('/student/study-sessions', { params: cleanParams(params) }),

  getSession: (id) => get(`/student/study-sessions/${id}`),

  /**
   * POST /student/study-sessions — 409 SCHEDULE_CONFLICT unless `force`.
   * The caller shows a ConfirmDialog and retries with force = true.
   */
  createSession: (payload, { force = false } = {}) =>
    post('/student/study-sessions', payload, {
      params: cleanParams({ force: force ? 'true' : '' }),
    }),

  updateSession: (id, payload, { force = false } = {}) =>
    patch(`/student/study-sessions/${id}`, payload, {
      params: cleanParams({ force: force ? 'true' : '' }),
    }),

  /** DELETE /student/study-sessions/:id?scope=single|series */
  deleteSession: (id, { scope = 'single' } = {}) =>
    del(`/student/study-sessions/${id}`, { params: { scope } }),

  /** POST /student/study-sessions/:id/reschedule — idempotent. */
  rescheduleSession: (id, payload) =>
    post(`/student/study-sessions/${id}/reschedule`, payload),

  /** POST /student/study-sessions/:id/attendance — completed/skipped/partial. */
  markAttendance: (id, payload) =>
    post(`/student/study-sessions/${id}/attendance`, payload),

  /** GET /student/timetable?from=&to=&view= */
  timetable: (params = {}) => get('/student/timetable', { params: cleanParams(params) }),

  /** POST /student/timetable/generate — returns a draft, persists nothing. */
  generate: (payload) => post('/student/timetable/generate', payload),

  /** POST /student/timetable/generate/save — persists the (edited) draft. */
  saveGenerated: (payload) => post('/student/timetable/generate/save', payload),
};

export default timetableApi;
