import { Link } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import EmptyState from '../../../components/ui/EmptyState';
import Logo from '../../../components/layout/Logo';
import { useAuth } from '../../../context/AuthContext';
import './NotFoundPage.css';

export default function NotFoundPage() {
  const { isAuthenticated, homeRoute } = useAuth();

  return (
    <main className="sp-notfound">
      <Link to={isAuthenticated ? homeRoute : '/login'} className="sp-notfound__brand">
        <Logo size={30} />
        <span>Smart Study Planner</span>
      </Link>

      <EmptyState
        icon="search"
        title="Page not found"
        description="The address you opened does not match any screen in the app. It may have been moved or the link may be incomplete."
        action={
          <Button variant="primary" to={isAuthenticated ? homeRoute : '/login'}>
            {isAuthenticated ? 'Back to dashboard' : 'Go to sign in'}
          </Button>
        }
        boxed
      />
    </main>
  );
}
