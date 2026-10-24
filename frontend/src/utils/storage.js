/**
 * Token + session persistence.
 *
 * Tokens live in localStorage so a refresh keeps the session; the access token
 * is short lived (1 h) and the refresh token is rotated by the backend. All
 * reads are guarded because localStorage throws in private-mode browsers.
 */

const ACCESS_KEY = 'ssp.access_token';
const REFRESH_KEY = 'ssp.refresh_token';
const USER_KEY = 'ssp.user';

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* storage unavailable — the session simply will not survive a reload */
  }
}

export function getAccessToken() {
  return safeGet(ACCESS_KEY);
}

export function setAccessToken(token) {
  safeSet(ACCESS_KEY, token);
}

export function getRefreshToken() {
  return safeGet(REFRESH_KEY);
}

export function setRefreshToken(token) {
  safeSet(REFRESH_KEY, token);
}

export function getStoredUser() {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  safeSet(USER_KEY, user ? JSON.stringify(user) : null);
}

export function saveSession({ access_token, refresh_token, user }) {
  if (access_token) setAccessToken(access_token);
  if (refresh_token) setRefreshToken(refresh_token);
  if (user) setStoredUser(user);
}

export function clearSession() {
  safeSet(ACCESS_KEY, null);
  safeSet(REFRESH_KEY, null);
  safeSet(USER_KEY, null);
}
