import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Calendar, Mail, Users } from 'lucide-react';

function Login() {
    const { login } = useAuth();

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-full mb-4">
                        <MessageSquare className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Financial Advisor AI
                    </h1>
                    <p className="text-gray-600">
                        Your intelligent assistant for managing clients, emails, and schedules
                    </p>
                </div>

                <div className="card">
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">
                            Welcome Back
                        </h2>
                        <p className="text-gray-600">
                            Sign in with your Google account to get started
                        </p>
                    </div>

                    <button
                        onClick={login}
                        className="w-full btn-primary flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="currentColor"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="currentColor"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="currentColor"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        Continue with Google
                    </button>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-500">
                            By signing in, you agree to our Terms of Service and Privacy Policy
                        </p>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-2">
                            <Mail className="w-6 h-6 text-green-600" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900">Gmail Integration</h3>
                        <p className="text-xs text-gray-500 mt-1">Read and send emails</p>
                    </div>
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-2">
                            <Calendar className="w-6 h-6 text-blue-600" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900">Calendar Sync</h3>
                        <p className="text-xs text-gray-500 mt-1">Manage your schedule</p>
                    </div>
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-2">
                            <Users className="w-6 h-6 text-purple-600" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900">HubSpot CRM</h3>
                        <p className="text-xs text-gray-500 mt-1">Manage contacts</p>
                    </div>
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 rounded-lg mb-2">
                            <MessageSquare className="w-6 h-6 text-orange-600" />
                        </div>
                        <h3 className="text-sm font-medium text-gray-900">AI Assistant</h3>
                        <p className="text-xs text-gray-500 mt-1">Smart conversations</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login; 