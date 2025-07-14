import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Integrations from './pages/Integrations';
import Rules from './pages/Rules';
import Tasks from './pages/Tasks';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth-callback" element={<AuthCallback />} />
            <Route
                path="/chat"
                element={
                    <PrivateRoute>
                        <Chat />
                    </PrivateRoute>
                }
            />
            <Route
                path="/"
                element={
                    <PrivateRoute>
                        <Layout />
                    </PrivateRoute>
                }
            >
                <Route index element={<Navigate to="/chat" replace />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="rules" element={<Rules />} />
                <Route path="tasks" element={<Tasks />} />
            </Route>
        </Routes>
    );
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App; 