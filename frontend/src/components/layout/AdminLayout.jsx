import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Badge from '../ui/Badge';
import IconButton from '../ui/IconButton';
import Logo from './Logo';
import SidebarNav from './SidebarNav';
import UserMenu from './UserMenu';
import { ADMIN_NAV } from '../../utils/constants';
import './Shell.css';

/**
 * Admin routes that are not top-level nav destinations still need a readable
 * crumb, otherwise the fallback renders the raw path (`#admin/audit-logs`).
 */
const EXTRA_CRUMB_LABELS = {
  '/admin/audit-logs': 'Audit Logs',
};

function crumbsFor(pathname) {
  const crumbs = [{ label: 'Admin', to: '/admin/dashboard' }];
  const known = EXTRA_CRUMB_LABELS[pathname];
  if (known) {
    crumbs.push({ label: known });
    return crumbs;
  }
  const match = [...ADMIN_NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (match) crumbs.push({ label: match.label, to: match.to });
  const tail = match ? pathname.replace(match.to, '').replace(/^\//, '') : '';
  if (tail) crumbs.push({ label: tail.split('/')[0] === 'new' ? 'New' : `#${tail}` });
  return crumbs;
}

/**
 * Admin shell: same skeleton as the student layout but visually distinct —
 * dark slate sidebar, an "Admin" badge beside the logo, breadcrumbs instead of
 * a page title and no bottom tab bar (admin is desktop first).
 */
export default function AdminLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const crumbs = crumbsFor(location.pathname);
  const current = crumbs[crumbs.length - 1]?.label || 'Admin';

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${current} · Admin · Smart Study Planner`;
  }, [current]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="sp-shell sp-shell--admin">
      <a className="sp-skip-link" href="#sp-main">
        Skip to main content
      </a>

      <aside
        className={`sp-shell__sidebar ${drawerOpen ? 'is-open' : ''}`}
        id="sp-admin-sidebar"
      >
        <div className="sp-shell__brand">
          <Logo size={28} tone="inverse" />
          <span className="sp-shell__brandname">Study Planner</span>
          <Badge tone="primary" size="sm" className="sp-shell__adminbadge">
            Admin
          </Badge>
          <IconButton
            icon="close"
            label="Close navigation"
            variant="inverse"
            className="sp-shell__drawerclose"
            onClick={() => setDrawerOpen(false)}
          />
        </div>

        <SidebarNav
          items={ADMIN_NAV}
          ariaLabel="Administration sections"
          onNavigate={() => setDrawerOpen(false)}
        />

        <div className="sp-shell__sidefoot">
          <Link to="/app/dashboard" className="sp-shell__sidelink">
            View student app
          </Link>
        </div>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          className="sp-shell__scrim"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      <div className="sp-shell__main">
        <header className="sp-shell__topbar">
          <IconButton
            icon="menu"
            label="Open navigation"
            className="sp-shell__hamburger"
            aria-expanded={drawerOpen}
            aria-controls="sp-admin-sidebar"
            onClick={() => setDrawerOpen(true)}
          />

          {/* The admin shell shows breadcrumbs rather than a visible page
              title, so the document's h1 is exposed to assistive technology
              only. Without it every admin page would start its heading
              hierarchy at h2 (PRD 9). */}
          <h1 className="sp-visually-hidden">{current}</h1>

          <nav className="sp-shell__crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`}>
                    {crumb.to && !last ? (
                      <Link to={crumb.to}>{crumb.label}</Link>
                    ) : (
                      <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                    )}
                    {!last ? (
                      <span className="sp-shell__crumbsep" aria-hidden="true">
                        /
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="sp-shell__topactions">
            <UserMenu settingsPath="/admin/settings" />
          </div>
        </header>

        <main className="sp-shell__content" id="sp-main" tabIndex={-1}>
          <div className="sp-shell__container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
