/**
 * Axios instance for the Smart Study Planner API.
 *
 * - baseURL `/api/v1` so the Vite dev proxy (and any production reverse proxy)
 *   forwards to Flask without an environment-specific host.
 * - Request interceptor attaches the stored access token.
 * - Response interceptor refreshes once on 401 via POST /auth/refresh, retries
 *   the original request, and logs out if the refresh itself fails.
 * - Every rejection is normalised into an ApiError carrying the backend's
 *   `{"error": {code, message, fields}}` envelope.
 *
 * No AI provider key ever appears here: the backend holds AI_API_KEY and the
 * frontend only calls /student/ai/*.
 */

import axios from 'axios';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
} from '../utils/storage';

export const API_BASE_URL = '/api/v1';

/** Dispatched when the session cannot be recovered; AuthContext listens. */
export const SESSION_EXPIRED_EVENT = 'ssp:session-expired';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json' },
  timeout: 60000,
});

/* --- Error normaliser --------------------------------------------------- */

const NETWORK_MESSAGE =
  'Cannot reach the server. Check that the backend is running and try again.';

export class ApiError extends Error {
  constructor({ message, code, status, fields, extra, isNetworkError }) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN_ERROR';
    this.status = status || 0;
    this.fields = fields || {};
    this.extra = extra || {};
    this.isNetworkError = Boolean(isNetworkError);
  }

  /** First field-level message, useful for inline form errors. */
  get firstFieldMessage() {
    const keys = Object.keys(this.fields);
    return keys.length ? this.fields[keys[0]] : null;
  }
}

export function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED') {
    return new ApiError({
      message: 'The request was cancelled.',
      code: 'CANCELLED',
      status: 0,
    });
  }

  if (!error?.response) {
    return new ApiError({
      message: error?.message?.includes('timeout')
        ? 'The server took too long to respond. Try again.'
        : NETWORK_MESSAGE,
      code: 'NETWORK_ERROR',
      status: 0,
      isNetworkError: true,
    });
  }

  const { status, data } = error.response;
  const envelope = data && typeof data === 'object' ? data.error : null;

  if (envelope && typeof envelope === 'object') {
    const { code, message, fields, ...extra } = envelope;
    return new ApiError({
      message: message || defaultMessageFor(status),
      code: code || defaultCodeFor(status),
      status,
      fields: fields && typeof fields === 'object' ? fields : {},
      extra,
    });
  }

  const message =
    (data && typeof data === 'object' && (data.message || data.msg)) ||
    (typeof data === 'string' && data) ||
    defaultMessageFor(status);

  return new ApiError({ message, code: defaultCodeFor(status), status });
}

function defaultCodeFor(status) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };
  return map[status] || 'HTTP_ERROR';
}

function defaultMessageFor(status) {
  const map = {
    400: 'The request could not be processed.',
    401: 'Your session has expired. Sign in again.',
    403: 'You do not have permission to do that.',
    404: 'We could not find what you were looking for.',
    409: 'That conflicts with existing data.',
    413: 'The file is too large.',
    422: 'Some of the submitted data is invalid.',
    429: 'Too many requests. Wait a moment and try again.',
    500: 'Something went wrong on the server.',
    503: 'That service is temporarily unavailable.',
  };
  return map[status] || 'The request failed.';
}

/* --- Request interceptor ------------------------------------------------ */

api.interceptors.request.use((config) => {
  if (!config.skipAuth) {
    const token = getAccessToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/* --- Refresh-once-on-401 interceptor ----------------------------------- */

const REFRESH_PATH = '/auth/refresh';
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/resend-verification',
];

let refreshPromise = null;

function requestRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.reject(new Error('no refresh token'));

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}${REFRESH_PATH}`, null, {
        headers: { Authorization: `Bearer ${refreshToken}` },
      })
      .then((response) => {
        const token = response?.data?.access_token;
        if (!token) throw new Error('refresh response had no access_token');
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function endSession(reason) {
  clearSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason } }));
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    const status = error?.response?.status;
    const url = config?.url || '';

    const refreshable =
      status === 401 &&
      config &&
      !config.skipAuth &&
      !config._retriedAfterRefresh &&
      !NO_REFRESH_PATHS.some((path) => url.startsWith(path));

    if (refreshable) {
      try {
        const token = await requestRefresh();
        config._retriedAfterRefresh = true;
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${token}` };
        return await api.request(config);
      } catch {
        endSession('refresh_failed');
        return Promise.reject(
          normalizeError({
            response: {
              status: 401,
              data: {
                error: {
                  code: 'SESSION_EXPIRED',
                  message: 'Your session has expired. Sign in again.',
                },
              },
            },
          }),
        );
      }
    }

    if (status === 401 && config && !config.skipAuth && config._retriedAfterRefresh) {
      endSession('unauthorized');
    }

    return Promise.reject(normalizeError(error));
  },
);

/* --- Thin verb helpers used by the per-domain service modules ----------- */

export async function get(url, config) {
  const response = await api.get(url, config);
  return response.data;
}

export async function post(url, body, config) {
  const response = await api.post(url, body, config);
  return response.data;
}

export async function patch(url, body, config) {
  const response = await api.patch(url, body, config);
  return response.data;
}

export async function put(url, body, config) {
  const response = await api.put(url, body, config);
  return response.data;
}

export async function del(url, config) {
  const response = await api.delete(url, config);
  return response.data;
}

/** Multipart upload. Lets axios set the boundary itself. */
export async function upload(url, formData, config = {}) {
  const response = await api.post(url, formData, {
    ...config,
    headers: { ...(config.headers || {}) },
  });
  return response.data;
}

/** Download a permission-checked file as a Blob (never a predictable URL). */
export async function download(url, config = {}) {
  const response = await api.get(url, { ...config, responseType: 'blob' });
  const disposition = response.headers?.['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return {
    blob: response.data,
    filename: match ? decodeURIComponent(match[1]) : null,
  };
}

/** Trigger a browser save dialog for a downloaded blob. */
export function saveBlob(blob, filename) {
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(href);
}

/** Drop empty params so the API never receives `?status=`. */
export function cleanParams(params = {}) {
  const out = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    out[key] = Array.isArray(value) ? value.join(',') : value;
  });
  return out;
}

export { api };
export default api;
