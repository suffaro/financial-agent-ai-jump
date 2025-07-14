import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    ErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                        <div className="mt-3 text-center">
                            <h3 className="text-lg font-medium text-gray-900">
                                Something went wrong
                            </h3>
                            <div className="mt-2">
                                <p className="text-sm text-gray-500">
                                    We encountered an unexpected error. Please try refreshing the page.
                                </p>
                            </div>
                            <div className="mt-4">
                                <button
                                    type="button"
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                    onClick={() => window.location.reload()}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh Page
                                </button>
                            </div>
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <div className="mt-4 p-3 bg-gray-100 rounded-md">
                                    <pre className="text-xs text-left text-gray-600 overflow-auto">
                                        {this.state.error.toString()}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;