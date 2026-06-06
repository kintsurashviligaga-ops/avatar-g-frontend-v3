import React, { Component, ReactNode, ErrorInfo } from 'react';
import { reportError } from '@/lib/observability/report-error';

type ErrorBoundaryProps = {
  fallback: ReactNode;
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Class-based error boundary — the ONLY way to catch React render errors.
 * Function components cannot use componentDidCatch / getDerivedStateFromError.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Forward to the unified reporter — structured console log AND Sentry
    // captureException with the React component stack as context. Previously this
    // only console.error'd, so a render crash showed a silent fallback UI while
    // being INVISIBLE to error tracking. reportError never throws (fail-safe), so
    // it is safe to call inside the boundary. (Sentry lights up when SENTRY_DSN is
    // set; without it, the structured log still lands in the platform logs.)
    reportError(error, {
      surface: 'ErrorBoundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return <>{this.props.fallback}</>;
    }
    return <>{this.props.children}</>;
  }
}

export default ErrorBoundary;
