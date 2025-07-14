import React, { useState, useEffect } from 'react';
import { BarChart3, Mail, Calendar, Users, CheckCircle, Clock, AlertTriangle, Wifi, WifiOff, MessageSquare } from 'lucide-react';
import axios from 'axios';
import AIMeetingChat from '../components/AIMeetingChat';

interface DashboardStats {
    totalEmails: number;
    totalEvents: number;
    totalContacts: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
}

interface ConnectionStatus {
    google: { connected: boolean; email?: string; name?: string };
    hubspot: { connected: boolean };
}

function Dashboard() {
    const [stats, setStats] = useState<DashboardStats>({
        totalEmails: 0,
        totalEvents: 0,
        totalContacts: 0,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        overdueTasks: 0
    });
    const [connections, setConnections] = useState<ConnectionStatus>({
        google: { connected: false },
        hubspot: { connected: false }
    });
    const [loading, setLoading] = useState(true);
    const [showChat, setShowChat] = useState(false);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [summaryResponse, taskStatsResponse, connectionsResponse] = await Promise.all([
                axios.get('/api/integrations/summary'),
                axios.get('/api/tasks/stats/summary'),
                axios.get('/api/integrations/connections')
            ]);

            const summary = summaryResponse.data.summary;
            const taskStats = taskStatsResponse.data.stats;
            const connectionsData = connectionsResponse.data.connections;

            setStats({
                totalEmails: summary.emails,
                totalEvents: summary.calendarEvents,
                totalContacts: summary.contacts,
                totalTasks: taskStats.total,
                completedTasks: taskStats.completed,
                pendingTasks: taskStats.pending,
                overdueTasks: taskStats.overdue
            });

            setConnections(connectionsData);
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-600 mt-2">
                        Overview of your AI assistant activity
                    </p>
                </div>
                <button
                    onClick={() => setShowChat(true)}
                    className="btn-primary flex items-center space-x-2"
                >
                    <MessageSquare className="h-4 w-4" />
                    <span>AI Meeting Chat</span>
                </button>
            </div>

            {/* stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Mail className="h-6 w-6 text-green-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Emails</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalEmails}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Calendar className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Events</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalEvents}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Users className="h-6 w-6 text-purple-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Contacts</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalContacts}</p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="flex items-center">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-orange-600" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600">Tasks</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* connection status */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Status</h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${connections.google.connected ? 'bg-green-100' : 'bg-gray-100'}`}>
                                <Mail className={`h-4 w-4 ${connections.google.connected ? 'text-green-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-gray-900">Google (Gmail & Calendar)</div>
                                {connections.google.email && (
                                    <div className="text-xs text-gray-500">{connections.google.email}</div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center">
                            {connections.google.connected ? (
                                <Wifi className="h-4 w-4 text-green-600" />
                            ) : (
                                <WifiOff className="h-4 w-4 text-gray-400" />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${connections.hubspot.connected ? 'bg-purple-100' : 'bg-gray-100'}`}>
                                <Users className={`h-4 w-4 ${connections.hubspot.connected ? 'text-purple-600' : 'text-gray-400'}`} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-gray-900">HubSpot CRM</div>
                                <div className="text-xs text-gray-500">
                                    {connections.hubspot.connected ? 'Contacts & Notes' : 'Not connected'}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center">
                            {connections.hubspot.connected ? (
                                <Wifi className="h-4 w-4 text-purple-600" />
                            ) : (
                                <div className="flex items-center space-x-2">
                                    <WifiOff className="h-4 w-4 text-gray-400" />
                                    <button
                                        onClick={() => window.location.href = '/integrations'}
                                        className="text-xs text-primary-600 hover:text-primary-800 underline"
                                    >
                                        Connect
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {(!connections.google.connected || !connections.hubspot.connected) && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                            Connect all integrations to get the most out of your AI assistant.{' '}
                            <button
                                onClick={() => window.location.href = '/integrations'}
                                className="underline hover:no-underline"
                            >
                                Manage integrations
                            </button>
                        </p>
                    </div>
                )}
            </div>

            {/* task overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Overview</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                                <span className="text-sm text-gray-600">Completed</span>
                            </div>
                            <span className="font-semibold text-gray-900">{stats.completedTasks}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <Clock className="h-5 w-5 text-blue-600 mr-2" />
                                <span className="text-sm text-gray-600">Pending</span>
                            </div>
                            <span className="font-semibold text-gray-900">{stats.pendingTasks}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                                <span className="text-sm text-gray-600">Overdue</span>
                            </div>
                            <span className="font-semibold text-gray-900">{stats.overdueTasks}</span>
                        </div>
                    </div>
                    {stats.totalTasks > 0 && (
                        <div className="mt-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Progress</span>
                                <span>{Math.round((stats.completedTasks / stats.totalTasks) * 100)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-primary-600 h-2 rounded-full"
                                    style={{ width: `${(stats.completedTasks / stats.totalTasks) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                        <button
                            onClick={() => window.location.href = '/chat'}
                            className="w-full btn-primary text-left flex items-center"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Start New Conversation
                        </button>
                        <button
                            onClick={() => window.location.href = '/tasks'}
                            className="w-full btn-secondary text-left flex items-center"
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            View All Tasks
                        </button>
                        <button
                            onClick={() => window.location.href = '/integrations'}
                            className="w-full btn-secondary text-left flex items-center"
                        >
                            <Users className="h-4 w-4 mr-2" />
                            Manage Integrations
                        </button>
                    </div>
                </div>
            </div>

            {/* recent activity */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                        <span>Connected Gmail and Calendar accounts</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                        <span>Synced {stats.totalEmails} emails from Gmail</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                        <span>Imported {stats.totalContacts} contacts from HubSpot</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-3"></div>
                        <span>Created {stats.totalTasks} tasks with AI assistance</span>
                    </div>
                </div>
            </div>

            {/* tips */}
            <div className="card bg-primary-50 border-primary-200">
                <h3 className="text-lg font-semibold text-primary-900 mb-2">AI Assistant Tips</h3>
                <div className="space-y-2 text-sm text-primary-800">
                    <p>• Ask "Who mentioned their kid plays baseball?" to search through emails and contacts</p>
                    <p>• Say "Schedule an appointment with Sara Smith" to automatically find contacts and set up meetings</p>
                    <p>• Try "When someone emails me that is not in HubSpot, please create a contact" for ongoing instructions</p>
                    <p>• Ask "Why did Greg say he wanted to sell AAPL stock?" to search through your data</p>
                </div>
            </div>

            {/* ai meeting chat modal*/}
            {showChat && (
                <AIMeetingChat onClose={() => setShowChat(false)} />
            )}
        </div>
    );
}

export default Dashboard; 