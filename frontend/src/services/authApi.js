/** /api/v1/auth — authentication and account recovery. */

import { get, post } from './api';
import { getRefreshToken } from '../utils/storage';

export const authApi = {
  /** POST /auth/register → 201 { message, user, verification_token? } */
  register: (payload) => post('/auth/register', payload, { skipAuth: true }),

  /** POST /auth/login → { access_token, refresh_token, user } */
  login: (email, password) =>
    post('/auth/login', { email, password }, { skipAuth: true }),

  /** POST /auth/logout — revokes the presented token. */
  logout: () => post('/auth/logout'),

  /** POST /auth/refresh — must be sent with the refresh token. */
  refresh: () =>
    post('/auth/refresh', null, {
      skipAuth: true,
      headers: { Authorization: `Bearer ${getRefreshToken() || ''}` },
    }),

  /** GET /auth/me — the server-verified role lives here. */
  me: () => get('/auth/me'),

  /** POST /auth/verify-email { token } */
  verifyEmail: (token) => post('/auth/verify-email', { token }, { skipAuth: true }),

  /** POST /auth/resend-verification { email } → { message, verification_token? } */
  resendVerification: (email) =>
    post('/auth/resend-verification', { email }, { skipAuth: true }),

  /** POST /auth/forgot-password { email } → { message, reset_token? } */
  forgotPassword: (email) =>
    post('/auth/forgot-password', { email }, { skipAuth: true }),

  /** POST /auth/reset-password { token, new_password } */
  resetPassword: (token, newPassword) =>
    post('/auth/reset-password', { token, new_password: newPassword }, { skipAuth: true }),

  /** POST /auth/change-password { current_password, new_password } */
  changePassword: (currentPassword, newPassword) =>
    post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

export default authApi;
