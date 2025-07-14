import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, Trash2, MessageCircle, User, Calendar } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'waiting_response';
    priority: 'low' | 'medium' | 'high';
    dueDate?: string;
    createdAt: string;
    completedAt?: string;
    metadata?: any;
    parentTask?: Task;
    subTasks?: Task[];
}

function Tasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'waiting' | 'completed'>('all');

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const response = await axios.get('/api/tasks');
            setTasks(response.data.tasks);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            toast.error('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    };


    // Task updates are only allowed through AI tool calls, but deletion is permitted
    const deleteTask = async (taskId: string) => {
        try {
            await axios.delete(`/api/tasks/${taskId}`);
            setTasks(tasks.filter(task => task.id !== taskId));
            toast.success('Task deleted successfully');
        } catch (error) {
            console.error('Failed to delete task:', error);
            toast.error('Failed to delete task');
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'text-red-600 bg-red-100';
            case 'medium': return 'text-yellow-600 bg-yellow-100';
            case 'low': return 'text-green-600 bg-green-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'in_progress': return <Clock className="h-5 w-5 text-blue-600" />;
            case 'waiting_response': return <MessageCircle className="h-5 w-5 text-orange-600" />;
            default: return <Circle className="h-5 w-5 text-gray-400" />;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Completed';
            case 'in_progress': return 'In Progress';
            case 'waiting_response': return 'Waiting for Response';
            case 'pending': return 'Pending';
            default: return status;
        }
    };

    const getTaskTypeIcon = (metadata: any) => {
        if (!metadata?.type) return null;

        switch (metadata.type) {
            case 'wait_response': return <User className="h-4 w-4 text-orange-500" />;
            case 'create_calendar_event': return <Calendar className="h-4 w-4 text-blue-500" />;
            default: return null;
        }
    };

    const filteredTasks = tasks.filter(task => {
        switch (filter) {
            case 'pending': return task.status === 'pending' || task.status === 'in_progress';
            case 'waiting': return task.status === 'waiting_response';
            case 'completed': return task.status === 'completed';
            default: return true;
        }
    });

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
                    <h1 className="header-title">Tasks</h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>View and manage AI-generated tasks</p>
                </div>
            </div>

            {/* filter tabs */}
            <div className="header-bottom" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
                <div className="tabs">
                    {[
                        { key: 'all', label: 'All Tasks', count: tasks.length },
                        { key: 'pending', label: 'Active', count: tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length },
                        { key: 'waiting', label: 'Waiting for Response', count: tasks.filter(t => t.status === 'waiting_response').length },
                        { key: 'completed', label: 'Completed', count: tasks.filter(t => t.status === 'completed').length }
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key as any)}
                            className={`tab ${filter === tab.key ? 'active' : ''}`}
                        >
                            {tab.label}
                            {tab.count > 0 && (
                                <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* table view */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Task
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Priority
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredTasks.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            {getStatusIcon(task.status)}
                                            <span className="ml-2 text-sm text-gray-600">
                                                {getStatusLabel(task.status)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-md">
                                            <div className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                                {task.title}
                                            </div>
                                            {task.description && (
                                                <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                                                    {task.description}
                                                </div>
                                            )}
                                            {task.status === 'waiting_response' && task.metadata && (
                                                <div className="mt-2 text-sm text-orange-600">
                                                    <MessageCircle className="h-4 w-4 inline mr-1" />
                                                    Waiting for: {task.metadata.contactName || 'user'}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            {getTaskTypeIcon(task.metadata)}
                                            <span className="ml-2 text-sm text-gray-500 capitalize">
                                                {task.metadata?.type?.replace('_', ' ') || 'General'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(task.priority)}`}>
                                            {task.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(task.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => deleteTask(task.id)}
                                            className="text-red-600 hover:text-red-900 hover:bg-red-50 p-1 rounded"
                                            title="Delete task"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {filteredTasks.length === 0 && (
                <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
                    <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
                    <p className="text-gray-500">Tasks will appear here when the AI creates them based on your conversations</p>
                </div>
            )}
        </div>
    );
}

export default Tasks; 