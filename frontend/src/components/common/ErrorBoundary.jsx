import { Component } from 'react';
import Button from '../ui/Button';
import ErrorState from '../ui/ErrorState';

/**
 * Last-resort boundary so a render error shows an actionable screen instead of
 * a blank page. Data-fetch errors are handled per page by ErrorState.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the detail in the console for debugging; never show a stack to users.
    console.error('Unhandled render error', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center' }}>
        <ErrorState
          title="The page could not be displayed"
          error={{ message: error.message || 'An unexpected error occurred.' }}
          boxed
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload the app
            </Button>
          }
        />
      </div>
    );
  }
}
