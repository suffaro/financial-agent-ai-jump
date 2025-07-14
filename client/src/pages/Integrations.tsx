import React, { useState, useEffect } from 'react';
import { Mail, Calendar, Users, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface IntegrationStatus {
    gmail: { connected: boolean; synced: boolean };
    calendar: { connected: boolean; synced: boolean };
    hubspot: { connected: boolean; synced: boolean };
}

interface IntegrationSummary {
    emails: number;
    calendarEvents: number;
    contacts: number;
    notes: number;
}

function Integrations() {
    const [status, setStatus] = useState<IntegrationStatus>({
        gmail: { connected: false, synced: false },
        calendar: { connected: false, synced: false },
        hubspot: { connected: false, synced: false }
    });
    const [summary, setSummary] = useState<IntegrationSummary>({
        emails: 0,
        calendarEvents: 0,
        contacts: 0,
        notes: 0
    });
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        fetchStatus();
        fetchSummary();

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('hubspot') === 'connected') {
            toast.success('HubSpot connected successfully!');
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => {
                fetchStatus();
                fetchSummary();
                syncIntegration('hubspot');
            }, 1000);
        }
        // eslint-disable-next-line
    }, []);

    const fetchStatus = async () => {
        try {
            const response = await axios.get('/api/integrations/sync/status');
            setStatus(response.data.status);
        } catch (error) {
            console.error('Failed to fetch status:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const response = await axios.get('/api/integrations/summary');
            setSummary(response.data.summary);
        } catch (error) {
            console.error('Failed to fetch summary:', error);
        }
    };

    const syncIntegration = async (integration: string) => {
        setSyncing(integration);
        try {
            switch (integration) {
                case 'gmail':
                case 'calendar':
                    await axios.post('/api/sync/google');
                    toast.success('Google sync started in background');
                    break;
                case 'hubspot':
                    await axios.post('/api/sync/hubspot');
                    toast.success('HubSpot sync started in background');
                    break;
            }

            setTimeout(() => {
                fetchStatus();
                fetchSummary();
            }, 2000);

            if (window.parent && window.parent.postMessage) {
                window.parent.postMessage({ type: 'SHOW_SYNC_PROGRESS' }, '*');
            }
        } catch (error: any) {
            console.error(`Failed to sync ${integration}:`, error);

            const errorCode = error.response?.data?.code;
            const errorMessage = error.response?.data?.error || `Failed to sync ${integration}`;
            
            if (errorCode === 'RATE_LIMITED') {
                toast.error('Rate limit exceeded. Please wait a few minutes before trying again.', {
                    duration: 8000
                });
            } else if (errorCode === 'HUBSPOT_TOKEN_EXPIRED') {
                toast.error('HubSpot connection expired. Please reconnect to continue syncing.', {
                    duration: 6000
                });
                fetchStatus();
            } else if (errorCode === 'HUBSPOT_AUTH_REQUIRED') {
                toast.error('HubSpot connection required. Please connect your HubSpot account first.');
                fetchStatus();
            } else if (errorCode === 'GOOGLE_TOKEN_EXPIRED') {
                toast.error('Google connection expired. Please refresh the page and sign in again.', {
                    duration: 6000
                });
                fetchStatus();
            } else if (errorCode === 'CALENDAR_API_DISABLED') {
                toast.error('Google Calendar sync is disabled. Gmail sync will continue normally.', {
                    duration: 5000
                });
            } else {
                toast.error(errorMessage || `Failed to sync ${integration}. Please try again.`);
            }
        } finally {
            setSyncing(null);
        }
    };

    const connectHubspot = () => {
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = `/api/auth/hubspot?token=${token}`;
        } else {
            window.location.href = '/api/auth/hubspot';
        }
    };

    const disconnectHubspot = async () => {
        if (!window.confirm('Are you sure you want to disconnect HubSpot? This will remove access to your contacts and notes.')) {
            return;
        }

        try {
            await axios.post('/api/auth/hubspot/disconnect');
            toast.success('HubSpot disconnected successfully');
            fetchStatus();
            fetchSummary();
        } catch (error) {
            console.error('Failed to disconnect HubSpot:', error);
            toast.error('Failed to disconnect HubSpot');
        }
    };

    const resetRateLimits = async () => {
        if (!window.confirm('Are you sure you want to reset rate limits? This will clear all rate limiters and force re-authentication.')) {
            return;
        }

        setResetting(true);
        try {
            await axios.post('/api/sync/reset-limits');
            toast.success('Rate limits reset successfully! You may need to reconnect integrations.');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error('Failed to reset rate limits:', error);
            toast.error('Failed to reset rate limits');
        } finally {
            setResetting(false);
        }
    };

    const getStatusIcon = (connected: boolean, synced: boolean, isExpired?: boolean) => {
        if (!connected || isExpired) return <XCircle className="h-5 w-5 text-red-500" />;
        if (!synced) return <RefreshCw className="h-5 w-5 text-yellow-500" />;
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    };

    const getStatusText = (connected: boolean, synced: boolean, isExpired?: boolean) => {
        if (!connected || isExpired) return isExpired ? 'Connection Expired' : 'Not Connected';
        if (!synced) return 'Connected (Not Synced)';
        return 'Connected & Synced';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="chat-window">
            <div className="modern-header">
                <div className="header-top">
                    <h1 className="header-title">Integrations</h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Manage your Gmail, Calendar, and HubSpot connections
                    </p>
                </div>
            </div>

            <div className="chat-log"> {/* Mmve content into chat-log for consistent spacing */}

                {/* Emergency Reset Button */}
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-md mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <XCircle className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">
                                    <strong>Rate Limit Issues?</strong> If you're experiencing "Too many requests" errors, reset all rate limits.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={resetRateLimits}
                            disabled={resetting}
                            className="btn-secondary text-sm bg-red-100 hover:bg-red-200 text-red-800 disabled:opacity-50"
                        >
                            {resetting ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                'Reset Rate Limits'
                            )}
                        </button>
                    </div>
                </div>

                {/* token expiration alert */}
                {!status.hubspot.connected && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <RefreshCw className="h-5 w-5 text-yellow-400" />
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-yellow-700">
                                    <strong>HubSpot Connection Required:</strong> Connect your HubSpot account to sync contacts and notes for AI assistance.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* gmail integration */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                    <Mail className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Gmail</h3>
                                    <p className="text-sm text-gray-500">Email integration</p>
                                </div>
                            </div>
                            {getStatusIcon(status.gmail.connected, status.gmail.synced)}
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            {getStatusText(status.gmail.connected, status.gmail.synced)}
                        </p>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                                {summary.emails} emails synced
                            </span>
                            <button
                                onClick={() => syncIntegration('gmail')}
                                disabled={!status.gmail.connected || syncing === 'gmail'}
                                className="btn-secondary text-sm disabled:opacity-50"
                            >
                                {syncing === 'gmail' ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Sync'
                                )}
                            </button>
                        </div>
                    </div>

                    {/* calendar integration */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <Calendar className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Calendar</h3>
                                    <p className="text-sm text-gray-500">Schedule management</p>
                                </div>
                            </div>
                            {getStatusIcon(status.calendar.connected, status.calendar.synced)}
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            {getStatusText(status.calendar.connected, status.calendar.synced)}
                        </p>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                                {summary.calendarEvents} events synced
                            </span>
                            <button
                                onClick={() => syncIntegration('calendar')}
                                disabled={!status.calendar.connected || syncing === 'calendar'}
                                className="btn-secondary text-sm disabled:opacity-50"
                            >
                                {syncing === 'calendar' ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Sync'
                                )}
                            </button>
                        </div>
                    </div>

                    {/* HubSpot integration */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                    <Users className="h-5 w-5 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">HubSpot</h3>
                                    <p className="text-sm text-gray-500">CRM integration</p>
                                </div>
                            </div>
                            {getStatusIcon(status.hubspot.connected, status.hubspot.synced)}
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            {getStatusText(status.hubspot.connected, status.hubspot.synced)}
                        </p>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">
                                {summary.contacts} contacts, {summary.notes} notes
                            </span>
                            {status.hubspot.connected ? (
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => syncIntegration('hubspot')}
                                        disabled={syncing === 'hubspot'}
                                        className="btn-secondary text-sm disabled:opacity-50"
                                    >
                                        {syncing === 'hubspot' ? (
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                            'Sync'
                                        )}
                                    </button>
                                    <button
                                        onClick={disconnectHubspot}
                                        className="text-sm text-red-600 hover:text-red-800 underline"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={connectHubspot}
                                    className="btn-primary text-sm"
                                >
                                    Connect
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-green-600">{summary.emails}</div>
                        <div className="text-sm text-gray-600">Emails</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-blue-600">{summary.calendarEvents}</div>
                        <div className="text-sm text-gray-600">Events</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-purple-600">{summary.contacts}</div>
                        <div className="text-sm text-gray-600">Contacts</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-2xl font-bold text-orange-600">{summary.notes}</div>
                        <div className="text-sm text-gray-600">Notes</div>
                    </div>
                </div>

                {/* instructions */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Getting Started</h3>
                    <div className="space-y-3 text-sm text-gray-600">
                        <p>
                            <strong>1. Gmail & Calendar:</strong> These are automatically connected when you sign in with Google.
                        </p>
                        <p>
                            <strong>2. HubSpot:</strong> Click "Connect" above to link your HubSpot account.
                        </p>
                        <p>
                            <strong>3. Sync Data:</strong> Use the "Sync" buttons to import your latest data.
                        </p>
                        <p>
                            <strong>4. AI Assistant:</strong> Once connected, you can ask the AI about your emails, contacts, and schedule.
                        </p>
                    </div>
                </div>
            </div> {/* close chat-log */}
        </div>
    );
}

export default Integrations;



