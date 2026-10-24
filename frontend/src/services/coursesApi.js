/** /api/v1/courses — the public catalogue of published courses. */

import { cleanParams, get } from './api';

export const coursesApi = {
  /** GET /courses?q=&category=&level=&page= */
  list: (params = {}) => get('/courses', { params: cleanParams(params) }),

  /** GET /courses/:id → detail + subjects + counts + is_enrolled */
  get: (id) => get(`/courses/${id}`),

  /** GET /courses/categories → { categories: [{ value, label, count }] } */
  categories: () => get('/courses/categories'),
};

export default coursesApi;
