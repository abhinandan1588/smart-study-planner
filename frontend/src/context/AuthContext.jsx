import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authApi } from '../services/authApi';
import { SESSION_EXPIRED_EVENT, normalizeError } from '../services/api';
import {
  clearSession,
  getAccessToken,
  getStoredUser,
  saveSession,
  setStoredUser,
} from '../utils/storage';

const AuthContext = createContext(null);

/** Landing route for a server-verified role. */
export function homeForRole(role) {
  return role === 'admin' ? '/admin/dashboard' : '/app/dashboard';
}

/**
 * Session owner for the whole app.
 *
 * Bootstrap: the stored user renders immediately (no auth flash on reload),
 * then GET /auth/me re-verifies the role against the server. The role used by
 * the route guards is always the one the server returned — never a value the
 * client could have edited in localStorage.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [bootstrapped, setBootstrapped] = useState(() => !getAccessToken());
  const [sessionMessage, setSessionMessage] = useState(null);
  const bootstrapRan = useRef(false);

  const applyUser = useCallback((nextUser) => {
    setUser(nextUser);
    setStoredUser(nextUser);
  }, []);

  const endSession = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  /** Re-read the profile from the server (role, status, preferences). */
  const refreshUser = useCallback(async () => {
    const payload = await authApi.me();
    const nextUser = payload?.user || null;
    applyUser(nextUser);
    return nextUser;
  }, [applyUser]);

  // --- Bootstrap from storage -------------------------------------------
  useEffect(() => {
    if (bootstrapRan.current) return;
    bootstrapRan.current = true;

    if (!getAccessToken()) {
      setBootstrapped(true);
      return;
    }

    refreshUser()
      .catch((caught) => {
        const error = normalizeError(caught);
        // 401 means the access + refresh pair is dead: drop the session.
        if (error.status === 401 || error.code === 'SESSION_EXPIRED') {
          endSession();
        }
      })
      .finally(() => setBootstrapped(true));
  }, [refreshUser, endSession]);

  // --- The api.js interceptor failed to refresh -------------------------
  useEffect(() => {
    function onExpired() {
      setUser(null);
      setSessionMessage('Your session expired. Sign in again to continue.');
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const payload = await authApi.login(email, password);
      saveSession(payload);
      setSessionMessage(null);
      // Trust the server for the role: /auth/me is the authority.
      try {
        return await refreshUser();
      } catch {
        applyUser(payload.user);
        return payload.user;
      }
    },
    [refreshUser, applyUser],
  );

  const register = useCallback((payload) => authApi.register(payload), []);

  const logout = useCallback(async () => {
    try {
      if (getAccessToken()) await authApi.logout();
    } catch {
      /* the token is revoked locally regardless of the server's answer */
    }
    endSession();
    setSessionMessage(null);
  }, [endSession]);

  const refreshAccessToken = useCallback(async () => {
    const payload = await authApi.refresh();
    saveSession({ access_token: payload.access_token, user: payload.user });
    if (payload.user) applyUser(payload.user);
    return payload.access_token;
  }, [applyUser]);

  const value = useMemo(
    () => ({
      user,
      role: user?.role || null,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      isStudent: user?.role === 'student',
      bootstrapped,
      sessionMessage,
      clearSessionMessage: () => setSessionMessage(null),
      login,
      register,
      logout,
      refreshUser,
      refreshAccessToken,
      setUser: applyUser,
      homeRoute: homeForRole(user?.role),
    }),
    [
      user,
      bootstrapped,
      sessionMessage,
      login,
      register,
      logout,
      refreshUser,
      refreshAccessToken,
      applyUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}

export default AuthContext;
