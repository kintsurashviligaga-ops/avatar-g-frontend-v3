"use client";

import { Component, ReactNode } from 'react';
import RocketLogo from './brand/RocketLogo';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#05070A] flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <RocketLogo size="lg" className="justify-center" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
              <p className="text-slate-400">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
