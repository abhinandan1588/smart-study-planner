/** /api/v1/student/analytics — chart series and insights from stored rows. */

import { cleanParams, get } from './api';

export const analyticsApi = {
  /** GET /student/analytics?range=7d|30d|90d&course_id= */
  overview: (params = {}) => get('/student/analytics', { params: cleanParams(params) }),

  /** GET /student/analytics/summary?period=week|month */
  summary: (params = {}) =>
    get('/student/analytics/summary', { params: cleanParams(params) }),
};

export default analyticsApi;
