import React, { useState, useEffect } from 'react';
import { CheckCircle, RefreshCw, X } from 'lucide-react';
import axios from 'axios';

interface SyncStatus {
    gmail: { connected: boolean; synced: boolean };
    calendar: { connected: boolean; synced: boolean };
    hubspot: { connected: boolean; synced: boolean };
}

interface SyncSummary {
    emails: number;
    calendarEvents: number;
    contacts: number;
    notes: number;
}

interface SyncProgressBarProps {
    show: boolean;
    onComplete: () => void;
}

function SyncProgressBar({ show, onComplete }: SyncProgressBarProps) {
    const [status, setStatus] = useState<SyncStatus>({
        gmail: { connected: false, synced: false },
        calendar: { connected: false, synced: false },
        hubspot: { connected: false, synced: false }
    });
    const [summary, setSummary] = useState<SyncSummary>({
        emails: 0,
        calendarEvents: 0,
        contacts: 0,
        notes: 0
    });
    const [isVisible, setIsVisible] = useState(show);
    const [currentSync, setCurrentSync] = useState<string | null>(null);

    useEffect(() => {
        setIsVisible(show);
        if (show) {
            startSyncProgress();
        }
    }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchStatus = async () => {
        try {
            const response = await axios.get('/api/integrations/sync/status');
            setStatus(response.data.status);
            return response.data.status;
        } catch (error) {
            console.error('Failed to fetch sync status:', error);
            return null;
        }
    };

    const fetchSummary = async () => {
        try {
            const response = await axios.get('/api/integrations/summary');
            setSummary(response.data.summary);
            return response.data.summary;
        } catch (error) {
            console.error('Failed to fetch sync summary:', error);
            return null;
        }
    };

    const startSyncProgress = async () => {
        const initialStatus = await fetchStatus();
        if (!initialStatus) return;

        // Simulate sync progress for services that are connected but not synced
        const syncTasks = [];
        
        if (initialStatus.gmail.connected && !initialStatus.gmail.synced) {
            syncTasks.push('gmail');
        }
        if (initialStatus.calendar.connected && !initialStatus.calendar.synced) {
            syncTasks.push('calendar');
        }
        if (initialStatus.hubspot.connected && !initialStatus.hubspot.synced) {
            syncTasks.push('hubspot');
        }

        // If everything is already synced, hide the bar
        if (syncTasks.length === 0) {
            setTimeout(() => {
                setIsVisible(false);
                onComplete();
            }, 2000);
            return;
        }

        // Show progress for each sync task
        for (const task of syncTasks) {
            setCurrentSync(task);
            
            // Wait for sync to complete (check status periodically)
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds max per service
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const currentStatus = await fetchStatus();
                await fetchSummary();
                
                if (currentStatus && currentStatus[task as keyof SyncStatus]?.synced) {
                    break;
                }
                attempts++;
            }
        }

        setCurrentSync(null);
        
        // Hide the bar after a short delay
        setTimeout(() => {
            setIsVisible(false);
            onComplete();
        }, 2000);
    };

    const getSyncStatusIcon = (service: keyof SyncStatus) => {
        const serviceStatus = status[service];
        if (!serviceStatus.connected) return null;
        
        if (currentSync === service) {
            return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
        }
        
        if (serviceStatus.synced) {
            return <CheckCircle className="h-4 w-4 text-green-500" />;
        }
        
        return <RefreshCw className="h-4 w-4 text-gray-400" />;
    };

    const getSyncStatusText = (service: keyof SyncStatus) => {
        const serviceStatus = status[service];
        if (!serviceStatus.connected) return null;
        
        if (currentSync === service) {
            return `Syncing ${service}...`;
        }
        
        if (serviceStatus.synced) {
            return `${service} synced`;
        }
        
        return `${service} pending`;
    };

    const getProgressPercentage = () => {
        const connectedServices = Object.values(status).filter(s => s.connected);
        const syncedServices = Object.values(status).filter(s => s.connected && s.synced);
        
        if (connectedServices.length === 0) return 100;
        return Math.round((syncedServices.length / connectedServices.length) * 100);
    };

    const getCurrentSyncDetails = () => {
        if (currentSync === 'gmail') {
            return `Fetching emails: ${summary.emails} imported (limit: 30 messages for development)`;
        }
        if (currentSync === 'calendar') {
            return `Fetching events: ${summary.calendarEvents} imported (limit: 30 messages for development)`;
        }
        if (currentSync === 'hubspot') {
            return `Fetching contacts: ${summary.contacts} contacts, ${summary.notes} notes`;
        }
        return '';
    };

    if (!isVisible) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between py-3">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
                            <span className="font-medium text-gray-900">Setting up your data</span>
                            <span className="text-sm text-gray-500">(syncing continues in background)</span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="flex items-center space-x-3">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${getProgressPercentage()}%` }}
                                ></div>
                            </div>
                            <span className="text-sm text-gray-600">{getProgressPercentage()}%</span>
                        </div>
                    </div>

                    {/* Current Sync Status */}
                    <div className="flex items-center space-x-6">
                        {(['gmail', 'calendar', 'hubspot'] as const).map(service => {
                            const icon = getSyncStatusIcon(service);
                            const text = getSyncStatusText(service);
                            
                            if (!icon || !text) return null;
                            
                            return (
                                <div key={service} className="flex items-center space-x-2">
                                    {icon}
                                    <span className={`text-sm capitalize ${
                                        currentSync === service ? 'text-blue-600 font-medium' : 'text-gray-600'
                                    }`}>
                                        {text}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={() => {
                            setIsVisible(false);
                            onComplete();
                        }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Hide sync progress"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Current Sync Details */}
                {currentSync && (
                    <div className="pb-2">
                        <div className="text-xs text-gray-500">
                            {getCurrentSyncDetails()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SyncProgressBar;