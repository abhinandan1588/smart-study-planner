import { Link } from 'react-router-dom';
import ThemeToggle from '../ui/ThemeToggle';
import Logo from './Logo';
import './AuthLayout.css';

/** Centred card on the app background. Product name + one-line tagline, no illustrations. */
export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  return (
    <main className="sp-auth">
      {/* Reachable before sign-in, so the preference can be set from the
          login screen rather than only from inside the app. */}
      <div className="sp-auth__themetoggle">
        <ThemeToggle />
      </div>

      <div className={`sp-auth__card ${wide ? 'sp-auth__card--wide' : ''}`.trim()}>
        <Link to="/login" className="sp-auth__brand">
          <Logo size={30} />
          <span className="sp-auth__brandtext">
            <span className="sp-auth__brandname">Smart Study Planner</span>
            <span className="sp-auth__tagline">
              Courses, syllabus, timetable and focus in one place.
            </span>
          </span>
        </Link>

        <div className="sp-auth__head">
          <h1 className="sp-auth__title">{title}</h1>
          {subtitle ? <p className="sp-auth__subtitle">{subtitle}</p> : null}
        </div>

        {children}
      </div>

      {footer ? <div className="sp-auth__footer">{footer}</div> : null}
    </main>
  );
}
