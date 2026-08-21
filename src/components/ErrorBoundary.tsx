import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // @ts-ignore
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-white">
          <div className="bg-red-950 border border-red-500 rounded p-6 max-w-4xl w-full">
            <h1 className="text-2xl font-bold text-red-400 mb-4">React App Crash Detected</h1>
            <h2 className="text-xl mb-4 font-mono">{this.state.error && this.state.error.toString()}</h2>
            <details className="whitespace-pre-wrap font-mono text-sm bg-black p-4 rounded overflow-auto max-h-96" open>
              <summary className="cursor-pointer text-gray-400 mb-2">Show component stack</summary>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </details>
            <button
              className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
              onClick={() => window.location.reload()}
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
