/**
 * /api/v1/student/resources — study materials.
 *
 * Files are never served from a predictable static path: the API returns an
 * opaque `download_url` and the permission check re-runs on every fetch, so
 * downloads go through axios as a Blob rather than a plain <a href>.
 */

import { cleanParams, del, download, get, post, saveBlob, upload } from './api';

export const materialsApi = {
  /** GET /student/resources?q=&type=&course_id=&scope=all|mine|bookmarked&page= */
  list: (params = {}) => get('/student/resources', { params: cleanParams(params) }),

  get: (id) => get(`/student/resources/${id}`),

  /** GET /student/resources/recent → last 10 opened. */
  recent: () => get('/student/resources/recent'),

  /**
   * POST /student/resources (multipart) — private upload.
   * `fields` carries title, description, resource_type, course_id, subject_id,
   * topic_id and tags.
   */
  upload: (file, fields = {}, config = {}) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(cleanParams(fields)).forEach(([key, value]) =>
      form.append(key, value),
    );
    return upload('/student/resources', form, config);
  },

  remove: (id) => del(`/student/resources/${id}`),

  /** POST /student/resources/:id/bookmark — toggle. */
  toggleBookmark: (id) => post(`/student/resources/${id}/bookmark`),

  /** Streams the permission-checked file and hands the browser a save dialog. */
  downloadFile: async (resource) => {
    const url = resource?.download_url
      ? resource.download_url.replace(/^\/api\/v1/, '')
      : `/student/resources/${resource.id}/file`;
    const { blob, filename } = await download(url);
    saveBlob(blob, filename || resource?.title || 'download');
  },
};

export default materialsApi;
