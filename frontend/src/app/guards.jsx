import { Navigate, Outlet, useLocation } from 'react-router-dom';
import LoadingScreen from '../components/layout/LoadingScreen';
import { homeForRole, useAuth } from '../context/AuthContext';

/**
 * Route guards.
 *
 * These are a navigation convenience only — the Flask API enforces role and
 * object-level authorization on every protected endpoint, so a tampered
 * localStorage role cannot read another role's data.
 */

/** Any authenticated account. Remembers where the user was heading. */
export function RequireAuth() {
  const { isAuthenticated, bootstrapped } = useAuth();
  const location = useLocation();

  if (!bootstrapped) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/** A specific server-verified role; the wrong role is sent to its own home. */
export function RequireRole({ role }) {
  const { user, isAuthenticated, bootstrapped } = useAuth();
  const location = useLocation();

  if (!bootstrapped) return <LoadingScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.role !== role) {
    return <Navigate to={homeForRole(user?.role)} replace />;
  }

  return <Outlet />;
}

/** Auth pages: an already-signed-in user goes straight to their dashboard. */
export function RedirectIfAuthenticated() {
  const { user, isAuthenticated, bootstrapped } = useAuth();

  if (!bootstrapped) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  return <Outlet />;
}

/** `/` → the dashboard for the signed-in role, or the login page. */
export function RoleHomeRedirect() {
  const { user, isAuthenticated, bootstrapped } = useAuth();

  if (!bootstrapped) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Navigate to={homeForRole(user?.role)} replace />;
}
