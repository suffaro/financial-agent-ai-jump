import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface User {
    id: string;
    email: string;
    name?: string;
    googleId?: string;
    hubspotId?: string;
    accessToken?: string;
    hubspotAccessToken?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: () => void;
    logout: () => void;
    checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }

            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
        } finally {
            setLoading(false);
        }
    };

    const login = () => {
        window.location.href = '/api/auth/google';
    };

    const logout = async () => {
        try {
            await axios.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
            setUser(null);
            toast.success('Logged out successfully');
        }
    };

    useEffect(() => {
        checkAuth();
        
        // Set up axios response interceptor to handle 401 errors
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    const errorCode = error.response.data?.code;
                    
                    // Handle different types of 401 errors
                    if (errorCode === 'HUBSPOT_TOKEN_EXPIRED') {
                        toast.error('HubSpot connection expired. Please reconnect.', {
                            duration: 5000,
                            id: 'hubspot-expired'
                        });
                        // Force refresh the auth status to update UI
                        checkAuth();
                    } else if (errorCode === 'HUBSPOT_AUTH_REQUIRED') {
                        toast.error('HubSpot connection required.', {
                            duration: 4000,
                            id: 'hubspot-required'
                        });
                    } else {
                        // General auth failure - clear tokens and redirect to login
                        localStorage.removeItem('token');
                        delete axios.defaults.headers.common['Authorization'];
                        setUser(null);
                        toast.error('Session expired. Please log in again.');
                    }
                }
                return Promise.reject(error);
            }
        );
        
        // Listen for storage changes (e.g., logout in another tab)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'token' && e.newValue === null) {
                setUser(null);
            }
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        return () => {
            axios.interceptors.response.eject(interceptor);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        checkAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
} 