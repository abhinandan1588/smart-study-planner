import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import IconButton from '../ui/IconButton';
import Logo from './Logo';
import SidebarNav from './SidebarNav';
import UserMenu from './UserMenu';
import { useAuth } from '../../context/AuthContext';
import { notificationsApi } from '../../services/notificationsApi';
import { STUDENT_MOBILE_NAV, STUDENT_NAV } from '../../utils/constants';
import './Shell.css';

const UNREAD_POLL_MS = 60000;

function titleForPath(pathname) {
  const match = [...STUDENT_NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  return match?.label || 'Smart Study Planner';
}

/**
 * Student shell: fixed 248px sidebar with the 11 PRD section 5 destinations,
 * a top bar with course search / notification bell / avatar menu, an
 * off-canvas drawer below 1024px and a bottom tab bar below 640px.
 */
export default function StudentLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const mainRef = useRef(null);

  const pageTitle = titleForPath(location.pathname);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${pageTitle} · Smart Study Planner`;
  }, [pageTitle]);

  // Unread badge: one small poll, failures are silent so the shell never breaks.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await notificationsApi.unreadCount();
        if (!cancelled) setUnread(Number(payload?.unread_count) || 0);
      } catch {
        /* a missing badge must never block navigation */
      }
    }

    load();
    const interval = setInterval(load, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  function onSearchSubmit(event) {
    event.preventDefault();
    const term = searchTerm.trim();
    navigate(term ? `/app/courses/browse?q=${encodeURIComponent(term)}` : '/app/courses/browse');
  }

  const navItems = STUDENT_NAV.map((item) =>
    item.to === '/app/notifications' && unread > 0 ? { ...item, badge: unread } : item,
  );

  return (
    <div className="sp-shell sp-shell--student">
      <a className="sp-skip-link" href="#sp-main">
        Skip to main content
      </a>

      <aside
        className={`sp-shell__sidebar ${drawerOpen ? 'is-open' : ''}`}
        id="sp-student-sidebar"
      >
        <div className="sp-shell__brand">
          <Logo size={28} />
          <span className="sp-shell__brandname">Smart Study Planner</span>
          <IconButton
            icon="close"
            label="Close navigation"
            className="sp-shell__drawerclose"
            onClick={() => setDrawerOpen(false)}
          />
        </div>

        <SidebarNav
          items={navItems}
          ariaLabel="Student sections"
          onNavigate={() => setDrawerOpen(false)}
        />

        <div className="sp-shell__sidefoot">
          <UserMenu settingsPath="/app/settings" />
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
            aria-controls="sp-student-sidebar"
            onClick={() => setDrawerOpen(true)}
          />

          <h1 className="sp-shell__pagetitle">{pageTitle}</h1>

          <form
            className="sp-shell__search"
            role="search"
            onSubmit={onSearchSubmit}
          >
            <label className="sp-visually-hidden" htmlFor="sp-global-search">
              Search courses
            </label>
            <Icon name="search" size={16} className="sp-shell__searchicon" />
            <input
              id="sp-global-search"
              type="search"
              className="sp-shell__searchinput"
              placeholder="Search courses…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </form>

          <div className="sp-shell__topactions">
            <IconButton
              icon="bell"
              label={
                unread > 0
                  ? `Notifications, ${unread} unread`
                  : 'Notifications'
              }
              badge={unread > 0 ? (unread > 99 ? '99+' : unread) : null}
              onClick={() => navigate('/app/notifications')}
            />
            <div className="sp-shell__usermenu">
              <UserMenu settingsPath="/app/settings" />
            </div>
          </div>
        </header>

        <main className="sp-shell__content" id="sp-main" ref={mainRef} tabIndex={-1}>
          <div className="sp-shell__container">
            <Outlet />
          </div>
        </main>

        <nav className="sp-shell__bottomnav" aria-label="Primary">
          {STUDENT_MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sp-shell__bottomlink ${isActive ? 'is-active' : ''}`
              }
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className="sp-shell__bottomlink"
            aria-expanded={drawerOpen}
            aria-controls="sp-student-sidebar"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="more" size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>

      <span className="sp-visually-hidden" aria-live="polite">
        {user ? `Signed in as ${user.full_name}` : ''}
      </span>
    </div>
  );
}
