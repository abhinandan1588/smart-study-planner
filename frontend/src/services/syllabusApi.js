/** /api/v1/student — syllabus tree, topic progress and revisions. */

import { cleanParams, get, patch } from './api';

export const syllabusApi = {
  /** GET /student/courses/:courseId/syllabus — full tree + totals. */
  forCourse: (courseId, params = {}) =>
    get(`/student/courses/${courseId}/syllabus`, { params: cleanParams(params) }),

  getTopicProgress: (topicId) => get(`/student/topics/${topicId}/progress`),

  /** PATCH /student/topics/:topicId/progress — upsert + recomputed percents. */
  updateTopicProgress: (topicId, payload) =>
    patch(`/student/topics/${topicId}/progress`, payload),

  /** GET /student/revisions?due_before= */
  revisions: (params = {}) =>
    get('/student/revisions', { params: cleanParams(params) }),
};

export default syllabusApi;
