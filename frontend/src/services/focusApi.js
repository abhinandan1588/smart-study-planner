/**
 * /api/v1/student/focus-sessions — the focus timer.
 *
 * The backend owns the clock: `started_at`, `target_minutes` and
 * `paused_accumulated_seconds` come from the server so the UI can rebuild a
 * running timer after a refresh, and completion is validated server side.
 */

import { cleanParams, get, patch, post } from './api';

export const focusApi = {
  /** GET /student/focus-sessions/active → running/paused session or null. */
  active: () => get('/student/focus-sessions/active'),

  /** POST /student/focus-sessions { mode, target_minutes, course_id?, ... } */
  start: (payload) => post('/student/focus-sessions', payload),

  /** PATCH /student/focus-sessions/:id { action } */
  action: (id, action, payload = {}) =>
    patch(`/student/focus-sessions/${id}`, { action, ...payload }),

  pause: (id) => focusApi.action(id, 'pause'),
  resume: (id) => focusApi.action(id, 'resume'),
  complete: (id) => focusApi.action(id, 'complete'),
  stop: (id) => focusApi.action(id, 'stop'),

  /** GET /student/focus-sessions?from=&to=&page= → history + totals. */
  history: (params = {}) =>
    get('/student/focus-sessions', { params: cleanParams(params) }),

  /** GET /student/focus-sessions/summary */
  summary: (params = {}) =>
    get('/student/focus-sessions/summary', { params: cleanParams(params) }),
};

export default focusApi;
