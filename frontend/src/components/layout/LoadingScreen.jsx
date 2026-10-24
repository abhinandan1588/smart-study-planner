import Logo from './Logo';
import Spinner from '../ui/Spinner';
import './LoadingScreen.css';

/** Shown while the session is being verified against GET /auth/me. */
export default function LoadingScreen({ message = 'Loading your workspace…' }) {
  return (
    <div className="sp-loading" role="status" aria-live="polite">
      <Logo size={34} />
      <p className="sp-loading__text">{message}</p>
      <Spinner size={18} tone="primary" />
    </div>
  );
}
