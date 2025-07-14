import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SyncProgressBar from './SyncProgressBar';
import {
    MessageSquare,
    Settings,
    LogOut,
    Menu,
    X,
    Zap,
    CheckSquare
} from 'lucide-react';

function Layout() {
    const { user, logout } = useAuth();
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const [showSyncProgress, setShowSyncProgress] = React.useState(false);

    // Show sync progress when coming from integrations or first-time user
    React.useEffect(() => {
        // Check URL for sync trigger params
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('hubspot') === 'connected') {
            setShowSyncProgress(true);
        }
    }, []);

    const navigation = [
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        { name: 'Rules', href: '/rules', icon: Zap },
        { name: 'Tasks', href: '/tasks', icon: CheckSquare },
        { name: 'Integrations', href: '/integrations', icon: Settings },
    ];

    return (
        <>
            {/* Global sync progress bar */}
            <SyncProgressBar 
                show={showSyncProgress} 
                onComplete={() => {
                    setShowSyncProgress(false);
                    window.location.reload();
                }} 
            />
            
            <div className="h-screen flex overflow-hidden bg-gray-50">
            {/* Mobile sidebar */}
            <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
                <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
                    <div className="absolute top-0 right-0 -mr-12 pt-2">
                        <button
                            type="button"
                            className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="h-6 w-6 text-white" />
                        </button>
                    </div>
                    <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
                        <div className="flex-shrink-0 flex items-center px-4">
                            <MessageSquare className="h-8 w-8 text-primary-600" />
                            <span className="ml-2 text-xl font-semibold text-gray-900">
                                AI Assistant
                            </span>
                        </div>
                        <nav className="mt-5 px-2 space-y-1">
                            {navigation.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        className={({ isActive }) =>
                                            `sidebar-item ${isActive ? 'active' : ''}`
                                        }
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <Icon className="mr-3 h-5 w-5" />
                                        {item.name}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </div>

            {/* Desktop sidebar */}
            <div className="hidden lg:flex lg:flex-shrink-0">
                <div className="flex flex-col w-64">
                    <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-gray-200">
                        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
                            <div className="flex items-center flex-shrink-0 px-4">
                                <MessageSquare className="h-8 w-8 text-primary-600" />
                                <span className="ml-2 text-xl font-semibold text-gray-900">
                                    AI Assistant
                                </span>
                            </div>
                            <nav className="mt-5 flex-1 px-2 space-y-1">
                                {navigation.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <NavLink
                                            key={item.name}
                                            to={item.href}
                                            className={({ isActive }) =>
                                                `sidebar-item ${isActive ? 'active' : ''}`
                                            }
                                        >
                                            <Icon className="mr-3 h-5 w-5" />
                                            {item.name}
                                        </NavLink>
                                    );
                                })}
                            </nav>
                        </div>
                        <div className="sidebar-user-info">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                                        <span className="text-sm font-medium text-white">
                                            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                                        </span>
                                    </div>
                                </div>
                                <div className="ml-3 flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-700 truncate">
                                        {user?.name || 'User'}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                </div>
                                <button
                                    onClick={logout}
                                    className="ml-2 flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                                >
                                    <LogOut className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-col w-0 flex-1 overflow-hidden">
                <div className="lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3">
                    <button
                        type="button"
                        className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>
                <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
                    <div className="py-6">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>
        </div>
        </>
    );
}

export default Layout; 