/** Single import point for every API service module. */

export { default as api, ApiError, normalizeError, SESSION_EXPIRED_EVENT } from './api';
export { authApi } from './authApi';
export { studentApi } from './studentApi';
export { coursesApi } from './coursesApi';
export { syllabusApi } from './syllabusApi';
export { timetableApi } from './timetableApi';
export { tasksApi } from './tasksApi';
export { focusApi } from './focusApi';
export { goalsApi } from './goalsApi';
export { analyticsApi } from './analyticsApi';
export { materialsApi } from './materialsApi';
export { notificationsApi } from './notificationsApi';
export { adminApi } from './adminApi';
export { aiApi } from './aiApi';
