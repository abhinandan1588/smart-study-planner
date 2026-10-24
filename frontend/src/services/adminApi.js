/**
 * /api/v1/admin — every administrator endpoint, grouped by the nine PRD 4.1
 * navigation areas so admin pages never build a URL inline.
 */

import { cleanParams, del, download, get, patch, post, saveBlob, upload } from './api';

function multipart(fields, file, fileField = 'file') {
  const form = new FormData();
  if (file) form.append(fileField, file);
  Object.entries(cleanParams(fields)).forEach(([key, value]) => form.append(key, value));
  return form;
}

async function csv(url, params, fallbackName) {
  const { blob, filename } = await download(url, { params: cleanParams(params) });
  saveBlob(blob, filename || fallbackName);
}

export const adminApi = {
  /* --- 1. Dashboard ---------------------------------------------------- */
  dashboard: (params = {}) => get('/admin/dashboard', { params: cleanParams(params) }),
  health: () => get('/admin/health'),

  /* --- 2. Student management ------------------------------------------ */
  students: {
    list: (params = {}) => get('/admin/students', { params: cleanParams(params) }),
    get: (id) => get(`/admin/students/${id}`),
    progress: (id, params = {}) =>
      get(`/admin/students/${id}/progress`, { params: cleanParams(params) }),
    setStatus: (id, status, reason) =>
      patch(`/admin/students/${id}/status`, cleanParams({ status, reason })),
    issuePasswordReset: (id) => post(`/admin/students/${id}/password-reset`),
    bulk: (ids, action) => post('/admin/students/bulk', { ids, action }),
    exportCsv: (params = {}) => csv('/admin/students/export', params, 'students.csv'),
  },

  /* --- 3. Course management ------------------------------------------- */
  courses: {
    list: (params = {}) => get('/admin/courses', { params: cleanParams(params) }),
    get: (id) => get(`/admin/courses/${id}`),
    create: (payload) => post('/admin/courses', payload),
    update: (id, payload) => patch(`/admin/courses/${id}`, payload),
    /**
     * DELETE archives the course; it never hard-deletes one with enrollments.
     * `confirm` acknowledges the active-enrollment impact the API reports in
     * its 409, `hard` only succeeds when nothing depends on the course.
     */
    archive: (id, { confirm = false, hard = false } = {}) =>
      del(`/admin/courses/${id}`, {
        params: cleanParams({
          confirm: confirm ? 'true' : '',
          hard: hard ? 'true' : '',
        }),
      }),
    publish: (id) => post(`/admin/courses/${id}/publish`),
    unpublish: (id, { confirm = false } = {}) =>
      post(`/admin/courses/${id}/unpublish`, confirm ? { confirm: true } : {}),
    preview: (id, params = {}) =>
      get(`/admin/courses/${id}/preview`, { params: cleanParams(params) }),
    enrollments: (id, params = {}) =>
      get(`/admin/courses/${id}/enrollments`, { params: cleanParams(params) }),
    listSubjects: (id) => get(`/admin/courses/${id}/subjects`),
    linkSubject: (id, payload) => post(`/admin/courses/${id}/subjects`, payload),
    unlinkSubject: (id, subjectId, { confirm = false } = {}) =>
      del(`/admin/courses/${id}/subjects/${subjectId}`, {
        params: cleanParams({ confirm: confirm ? 'true' : '' }),
      }),
    reorderSubjects: (id, order) =>
      patch(`/admin/courses/${id}/subjects/reorder`, { order }),
  },

  /* --- 4. Subject management ------------------------------------------ */
  subjects: {
    list: (params = {}) => get('/admin/subjects', { params: cleanParams(params) }),
    get: (id) => get(`/admin/subjects/${id}`),
    units: (id, params = {}) =>
      get(`/admin/subjects/${id}/units`, { params: cleanParams(params) }),
    create: (payload) => post('/admin/subjects', payload),
    update: (id, payload) => patch(`/admin/subjects/${id}`, payload),
    /** DELETE archives; `hard` only succeeds with no units and no progress. */
    archive: (id, { hard = false } = {}) =>
      del(`/admin/subjects/${id}`, {
        params: cleanParams({ hard: hard ? 'true' : '' }),
      }),
    /** Reorder the subjects linked to one course. */
    reorder: (courseId, items) =>
      patch('/admin/subjects/reorder', { course_id: courseId, items }),
  },

  /* --- 5. Syllabus management ------------------------------------------ */
  syllabus: {
    tree: (params = {}) => get('/admin/syllabus', { params: cleanParams(params) }),
    preview: (params = {}) =>
      get('/admin/syllabus/preview', { params: cleanParams(params) }),
    listVersions: (params = {}) =>
      get('/admin/syllabus/versions', { params: cleanParams(params) }),
    createVersion: (payload) => post('/admin/syllabus/versions', payload),
    updateVersion: (id, payload) => patch(`/admin/syllabus/versions/${id}`, payload),
    publishVersion: (id, payload = {}) =>
      post(`/admin/syllabus/versions/${id}/publish`, payload),
    versionImpact: (id) => get(`/admin/syllabus/versions/${id}/impact`),
    migrateProgress: (id, payload = {}) =>
      post(`/admin/syllabus/versions/${id}/migrate-progress`, payload),
    /** POST /admin/syllabus { kind: 'unit' | 'topic', ... } */
    createItem: (payload) => post('/admin/syllabus', payload),
    updateItem: (id, payload) => patch(`/admin/syllabus/${id}`, payload),
    /** DELETE /admin/syllabus/:id?kind=unit|topic&force=true */
    deleteItem: (id, { kind, force = false } = {}) =>
      del(`/admin/syllabus/${id}`, {
        params: cleanParams({ kind, force: force ? 'true' : '' }),
      }),
    reorder: (kind, items) => patch('/admin/syllabus/reorder', { kind, items }),
    importCsv: (file, syllabusVersionId, extra = {}) =>
      upload(
        '/admin/syllabus/import',
        multipart({ syllabus_version_id: syllabusVersionId, ...extra }, file),
      ),
    importTemplate: () =>
      csv('/admin/syllabus/import/template', {}, 'syllabus-template.csv'),
  },

  /* --- 6. Study material management ----------------------------------- */
  resources: {
    list: (params = {}) => get('/admin/resources', { params: cleanParams(params) }),
    get: (id) => get(`/admin/resources/${id}`),
    create: (fields, file) => upload('/admin/resources', multipart(fields, file)),
    /** PATCH accepts metadata JSON, or multipart when replacing the file. */
    update: (id, fields, file) =>
      file
        ? patch(`/admin/resources/${id}`, multipart(fields, file))
        : patch(`/admin/resources/${id}`, fields),
    publish: (id) => post(`/admin/resources/${id}/publish`),
    unpublish: (id) => post(`/admin/resources/${id}/unpublish`),
    /**
     * DELETE archives; `hard` removes the file and the row (audited).
     * `confirm` acknowledges the download count the API reports in its 409.
     */
    remove: (id, { hard = false, confirm = false } = {}) =>
      del(`/admin/resources/${id}`, {
        params: cleanParams({
          hard: hard ? 'true' : '',
          confirm: confirm ? 'true' : '',
        }),
      }),
    storage: () => get('/admin/resources/storage'),
    downloadFile: async (resource) => {
      const { blob, filename } = await download(`/admin/resources/${resource.id}/file`);
      saveBlob(blob, filename || resource?.title || 'download');
    },
  },

  /* --- 7. Announcements and notifications ------------------------------ */
  announcements: {
    list: (params = {}) =>
      get('/admin/announcements', { params: cleanParams(params) }),
    get: (id) => get(`/admin/announcements/${id}`),
    create: (payload) => post('/admin/announcements', payload),
    update: (id, payload) => patch(`/admin/announcements/${id}`, payload),
    /** DELETE archives; `hard` removes the row (delivered notices are kept). */
    remove: (id, { hard = false } = {}) =>
      del(`/admin/announcements/${id}`, {
        params: cleanParams({ hard: hard ? 'true' : '' }),
      }),
    publish: (id) => post(`/admin/announcements/${id}/publish`),
    expire: (id, expiresAt) =>
      post(`/admin/announcements/${id}/expire`, cleanParams({ expires_at: expiresAt })),
    recipients: (id, params = {}) =>
      get(`/admin/announcements/${id}/recipients`, { params: cleanParams(params) }),
  },

  /* --- 8. Reports and analytics ---------------------------------------- */
  reports: {
    get: (params = {}) => get('/admin/reports', { params: cleanParams(params) }),
    summary: (params = {}) =>
      get('/admin/reports/summary', { params: cleanParams(params) }),
    exportCsv: (params = {}) =>
      csv('/admin/reports/export', params, `report-${params.type || 'export'}.csv`),
  },

  /* --- 9. Profile and settings ----------------------------------------- */
  profile: {
    get: () => get('/admin/profile'),
    update: (payload) => patch('/admin/profile', payload),
    changePassword: (currentPassword, newPassword) =>
      post('/admin/profile/password', {
        current_password: currentPassword,
        new_password: newPassword,
      }),
  },
  settings: {
    get: () => get('/admin/settings'),
    update: (payload) => patch('/admin/settings', payload),
  },
  admins: {
    list: (params = {}) => get('/admin/admins', { params: cleanParams(params) }),
    create: (payload) => post('/admin/admins', payload),
    update: (id, payload) => patch(`/admin/admins/${id}`, payload),
    issuePasswordReset: (id) => post(`/admin/admins/${id}/password-reset`),
    resendVerification: (id) => post(`/admin/admins/${id}/resend-verification`),
  },
  auditLogs: (params = {}) => get('/admin/audit-logs', { params: cleanParams(params) }),
};

export default adminApi;
