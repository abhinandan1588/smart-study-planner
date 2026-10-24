import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ToastProvider from '../components/ui/ToastProvider';
import { AuthProvider } from '../context/AuthContext';
import AppRouter from './router';

/** Provider stack for the whole app: errors → toasts → router → session. */
export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
