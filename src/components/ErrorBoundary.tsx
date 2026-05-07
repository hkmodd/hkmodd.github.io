import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-red-500/30 bg-red-500/5 rounded-lg m-6">
          <h2 className="text-xl font-mono text-red-500 mb-2">⚠ SYSTEM FAULT</h2>
          <p className="text-sm text-red-400/80 mb-4">Module loading failed due to network instability.</p>
          <button 
            className="px-4 py-2 border border-red-500/50 text-red-500 font-mono text-xs hover:bg-red-500/10 transition-colors"
            onClick={() => window.location.reload()}
          >
            [ REBOOT CONNECTION ]
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
