import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ToastProvider from '../components/ui/ToastProvider';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import AppRouter from './router';

/**
 * Provider stack for the whole app: errors → theme → toasts → router → session.
 * Theme sits above the toasts so a toast rendered during startup is already
 * themed.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRouter />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
