import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SyncProgressBar from '../components/SyncProgressBar';
import { useAuth } from '../contexts/AuthContext';

function AuthCallback() {
    const navigate = useNavigate();
    const [isAuthenticating, setIsAuthenticating] = useState(true);
    const [showSyncProgress, setShowSyncProgress] = useState(false);

    const { checkAuth } = useAuth();

    useEffect(() => {
        const handleCallback = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            console.log('AuthCallback: token found:', token);

            if (token) {
                try {
                    localStorage.setItem('token', token);

                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                    const response = await axios.get('/api/auth/me');
                    console.log('AuthCallback: user data:', response.data);

                    window.history.replaceState({}, document.title, '/');

                    const user = response.data.user;
                    if (user.isGoogleConnected || user.isHubspotConnected) {
                        setIsAuthenticating(false);
                        setShowSyncProgress(true);
                        
                        try {
                            await axios.post('/api/sync/trigger');
                            console.log('Auto-polling sync started successfully');
                        } catch (error) {
                            console.error('Failed to start auto-polling sync:', error);
                        }
                    } else {
                        setIsAuthenticating(false);
                        navigate('/chat');
                    }
                } catch (error) {
                    console.error('AuthCallback: token validation failed:', error);
                    localStorage.removeItem('token');
                    setIsAuthenticating(false);
                    navigate('/login');
                }
            } else {
                console.log('AuthCallback: no token found');
                setIsAuthenticating(false);
                navigate('/login');
            }
        };

        handleCallback();
    }, [navigate, checkAuth]);

    return (
        <>
            <SyncProgressBar
                show={showSyncProgress}
                onComplete={() => {
                    setShowSyncProgress(false);
                    checkAuth().then(() => {
                        navigate('/chat');
                        window.location.reload();
                    });
                }}
            />

            {(isAuthenticating || showSyncProgress) && (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6"></div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">
                            {isAuthenticating ? 'Completing login...' : 'Syncing your data...'}
                        </h2>
                        <p className="text-gray-500">
                            {isAuthenticating ? 'Just a moment...' : 'This may take a few seconds...'}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}

export default AuthCallback;