import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Settings, Trash2, X, MessageSquare, Zap, CheckSquare, LogOut, Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useAuth } from '../contexts/AuthContext';

// Speech Recognition types
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onerror: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    start(): void;
    stop(): void;
}

declare global {
    interface Window {
        SpeechRecognition: {
            new(): SpeechRecognition;
        };
        webkitSpeechRecognition: {
            new(): SpeechRecognition;
        };
    }
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    toolCalls?: any[];
}

interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    messages: Message[];
}

function Chat() {
    const { user, logout } = useAuth(); // for authentication context
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showNewConversation, setShowNewConversation] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showDebugInfo, setShowDebugInfo] = useState(false);
    const [autoSync, setAutoSync] = useState(true);
    const [useWebhooks, setUseWebhooks] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [currentContext, setCurrentContext] = useState('all');
    const [showContextDropdown, setShowContextDropdown] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const navigation = [
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        { name: 'Rules', href: '/rules', icon: Zap },
        { name: 'Tasks', href: '/tasks', icon: CheckSquare },
        { name: 'Integrations', href: '/integrations', icon: Settings },
    ];

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        fetchConversations();
        fetchSettings();

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognitionInstance = new SpeechRecognition();
            recognitionInstance.continuous = false;
            recognitionInstance.interimResults = false;
            recognitionInstance.lang = 'en-US';

            recognitionInstance.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInputMessage(transcript);
                setIsRecording(false);
            };

            recognitionInstance.onerror = () => {
                setIsRecording(false);
                toast.error('Voice recognition failed');
            };

            recognitionInstance.onend = () => {
                setIsRecording(false);
            };

            setRecognition(recognitionInstance);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchConversations = async () => {
        try {
            const response = await axios.get('/api/chat/conversations');
            setConversations(response.data.conversations);

            const lastConversationId = localStorage.getItem('lastActiveConversation');
            if (lastConversationId && response.data.conversations.length > 0) {
                const lastConversation = response.data.conversations.find(
                    (conv: Conversation) => conv.id === lastConversationId
                );
                if (lastConversation) {
                    setCurrentConversation(lastConversation);
                    loadConversation(lastConversationId);
                    return;
                }
            }
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
            toast.error('Failed to load conversations');
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await axios.get('/api/settings');
            const settings = response.data.settings;
            setShowDebugInfo(settings.showDebugInfo || false);
            setAutoSync(settings.autoSync !== undefined ? settings.autoSync : true);
            setUseWebhooks(settings.useWebhooks || false);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const saveSettings = async () => {
        try {
            const settings = {
                showDebugInfo,
                autoSync,
                useWebhooks
            };
            const response = await axios.put('/api/settings', { settings });

            if (response.data.webhooks) {
                const webhookResults = response.data.webhooks;
                let successCount = 0;
                let warnings: string[] = [];

                if (webhookResults.gmail) {
                    if (webhookResults.gmail.success) {
                        successCount++;
                    } else if (webhookResults.gmail.skipped) {
                        warnings.push('Gmail: ' + webhookResults.gmail.reason);
                    } else if (webhookResults.gmail.error) {
                        warnings.push('Gmail: Setup failed');
                    }
                }

                if (webhookResults.calendar) {
                    if (webhookResults.calendar.success) {
                        successCount++;
                    } else if (webhookResults.calendar.skipped) {
                        warnings.push('Calendar: ' + webhookResults.calendar.reason);
                    } else if (webhookResults.calendar.error) {
                        warnings.push('Calendar: Setup failed');
                    }
                }

                if (webhookResults.hubspot) {
                    if (webhookResults.hubspot.success) {
                        successCount++;
                    } else if (webhookResults.hubspot.simulated) {
                        warnings.push('HubSpot: Simulated (requires production config)');
                    } else if (webhookResults.hubspot.skipped) {
                        warnings.push('HubSpot: ' + webhookResults.hubspot.reason);
                    } else if (webhookResults.hubspot.error) {
                        warnings.push('HubSpot: Setup failed');
                    }
                }

                if (successCount > 0) {
                    toast.success(`Settings saved! ${successCount} webhook(s) configured successfully.`);
                    if (warnings.length > 0) {
                        setTimeout(() => {
                            toast(`Note: ${warnings.join('; ')}`, { icon: '⚠️' });
                        }, 1000);
                    }
                } else if (warnings.length > 0) {
                    toast(`Settings saved, but webhooks need configuration: ${warnings.join('; ')}`, { icon: '⚠️' });
                } else {
                    toast.success('Settings saved successfully');
                }
            } else {
                toast.success('Settings saved successfully');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            toast.error('Failed to save settings');
        }
    };

    const createNewConversation = useCallback(async (showToast = true) => {
        try {
            const response = await axios.post('/api/chat/conversations', {
                title: 'New Conversation'
            });
            const newConversation = response.data.conversation;
            setConversations([newConversation, ...conversations]);
            setCurrentConversation(newConversation);
            setMessages([]);
            setShowNewConversation(false);
            setShowHistory(false);
            if (showToast) {
                toast.success('New conversation created');
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
            toast.error('Failed to create new conversation');
        }
    }, [conversations]);

    useEffect(() => {
        if (currentConversation) {
            localStorage.setItem('lastActiveConversation', currentConversation.id);
        }
    }, [currentConversation]);

    const deleteConversation = async (conversationId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this conversation?')) {
            return;
        }

        try {
            await axios.delete(`/api/chat/conversations/${conversationId}`);
            setConversations(prev => prev.filter(conv => conv.id !== conversationId));
            if (currentConversation?.id === conversationId) {
                setCurrentConversation(null);
                setMessages([]);
            }
            toast.success('Conversation deleted');
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            toast.error('Failed to delete conversation');
        }
    };

    const clearAllConversations = async () => {
        if (!window.confirm('Are you sure you want to delete ALL conversations? This action cannot be undone.')) {
            return;
        }

        try {
            await Promise.all(conversations.map(conv =>
                axios.delete(`/api/chat/conversations/${conv.id}`)
            ));
            setConversations([]);
            setCurrentConversation(null);
            setMessages([]);
            setShowHistory(false);
            toast.success('All conversations deleted');
        } catch (error) {
            console.error('Failed to delete all conversations:', error);
            toast.error('Failed to delete all conversations');
        }
    };

    const loadConversation = async (conversationId: string) => {
        try {
            const response = await axios.get(`/api/chat/conversations/${conversationId}`);
            const conversation = response.data.conversation;
            setCurrentConversation(conversation);
            setMessages(conversation.messages);
            setShowHistory(false);
        } catch (error) {
            console.error('Failed to load conversation:', error);
            toast.error('Failed to load conversation');
        }
    };

    const sendMessage = async () => {
        if (!inputMessage.trim()) return;

        let conversationToUse = currentConversation;

        if (!conversationToUse) {
            try {
                const response = await axios.post('/api/chat/conversations', {
                    title: 'New Conversation'
                });
                conversationToUse = response.data.conversation;
                setConversations(prev => [conversationToUse!, ...prev]);
                setCurrentConversation(conversationToUse);
            } catch (error) {
                console.error('Failed to create conversation:', error);
                toast.error('Failed to create new conversation');
                return;
            }
        }

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputMessage,
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setIsLoading(true);

        if (!conversationToUse) {
            setIsLoading(false);
            toast.error('No conversation available');
            return;
        }

        try {
            const response = await axios.post(`/api/chat/conversations/${conversationToUse.id}/messages`, {
                content: inputMessage,
                context: currentContext
            });

            const assistantMessage: Message = {
                id: response.data.assistantMessage.id,
                role: 'assistant',
                content: response.data.assistantMessage.content,
                createdAt: response.data.assistantMessage.createdAt,
                toolCalls: response.data.assistantMessage.toolCalls
            };

            setMessages(prev => [...prev, assistantMessage]);

            if (messages.length === 0) {
                const title = inputMessage.length > 50
                    ? inputMessage.substring(0, 50) + '...'
                    : inputMessage;

                const updatedConversation = {
                    ...conversationToUse,
                    title
                };
                setCurrentConversation(updatedConversation);
                setConversations(prev =>
                    prev.map(conv =>
                        conv.id === conversationToUse!.id ? updatedConversation : conv
                    )
                );
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            toast.error('Failed to send message');
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        } else if (e.key === 'Enter' && e.shiftKey) {
        }
    };


    const contextOptions = [
        { value: 'all', label: 'All data' },
        { value: 'meetings', label: 'Meetings only' },
        { value: 'emails', label: 'Emails only' },
        { value: 'calendar', label: 'Calendar only' },
        { value: 'contacts', label: 'Contacts only' }
    ];

    const getContextLabel = (value: string) => {
        return contextOptions.find(option => option.value === value)?.label || 'All data';
    };

    const toggleVoiceRecording = () => {
        if (!recognition) {
            toast.error('Voice recognition not supported in this browser. Try using Chrome or Edge.');
            return;
        }

        try {
            if (isRecording) {
                recognition.stop();
                setIsRecording(false);
            } else {
                recognition.start();
                setIsRecording(true);
            }
        } catch (error) {
            console.error('Speech recognition error:', error);
            toast.error('Failed to start voice recognition');
            setIsRecording(false);
        }
    };

    return (
        <div className="h-screen flex overflow-hidden bg-gray-50">
            {/* mobile sidebar */}
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

            {/* desktop sidebar */}
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

            {/* chat content */}
            <div className="flex flex-col w-0 flex-1 overflow-hidden">
                {/* mobile menu button */}
                <div className="lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3">
                    <button
                        type="button"
                        className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>

                <div className="chat-window flex-1 flex flex-col bg-white">
                    {/* modern header */}
                    <div className="modern-header">
                        <div className="header-top">
                            <h1 className="header-title">Ask Anything</h1>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => createNewConversation()}
                                    className={`new-thread-button ${(!currentConversation || messages.length === 0) ? 'disabled' : ''}`}
                                    disabled={!currentConversation || messages.length === 0}
                                >
                                    + New Thread
                                </button>
                                <button
                                    onClick={() => setShowSettings(true)}
                                    className="chat-button"
                                    title="Settings"
                                >
                                    <Settings className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={() => {
                                        window.history.back();
                                    }}
                                    className="close-button"
                                    title="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="header-bottom">
                            <div className="tabs">
                                <button className="tab active">
                                    Chat
                                </button>
                                <button
                                    onClick={() => setShowHistory(true)}
                                    className="tab"
                                >
                                    History
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* context info */}
                    <div className="context-info">
                        <hr />
                        <span className="date">
                            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div>Context: {getContextLabel(currentContext)}</div>
                    </div>

                    {currentConversation ? (
                        <>
                            {/* messages */}
                            <div className="chat-log">
                                {messages.length === 0 && (
                                    <div className="text-center py-8">
                                        <p className="text-gray-600 mb-6">
                                            I can answer questions about any Jump meeting. What do you want to know?
                                        </p>

                                    </div>
                                )}

                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`chat-message ${message.role}`}
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeHighlight]}
                                            className="prose prose-sm max-w-none"
                                        >
                                            {message.content}
                                        </ReactMarkdown>

                                        {message.toolCalls && message.toolCalls.length > 0 && showDebugInfo && (
                                            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                                <strong className="text-blue-800 text-sm">Actions taken:</strong>
                                                <ul className="mt-2 space-y-1">
                                                    {message.toolCalls.map((call: any, index: number) => (
                                                        <li key={index} className="text-sm text-blue-700">
                                                            <span className="font-medium">{call.function?.name}:</span> {JSON.stringify(call.function?.arguments)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="chat-message-assistant max-w-4xl">
                                        <div className="flex space-x-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* modern input area */}
                            <div className="chat-input-area">
                                <div className="chat-input-container">
                                    <button
                                        onClick={() => {
                                            // add attachment functionality
                                            const fileInput = document.createElement('input');
                                            fileInput.type = 'file';
                                            fileInput.accept = 'image/*,text/*,.pdf,.doc,.docx';
                                            fileInput.onchange = (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (file) {
                                                    toast(`File selected: ${file.name}. File upload feature coming soon!`);
                                                }
                                            };
                                            fileInput.click();
                                        }}
                                        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                                        title="Attach file"
                                    >
                                        <Plus className="h-5 w-5" />
                                    </button>
                                    <textarea
                                        value={inputMessage}
                                        onChange={(e) => {
                                            setInputMessage(e.target.value);
                                            // auto-resize textarea
                                            e.target.style.height = 'auto';
                                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                        }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask anything about your meetings..."
                                        className="chat-input-textarea"
                                        rows={1}
                                        disabled={isLoading}
                                    />

                                    {/* input actions */}
                                    <div className="input-actions">
                                        <div className="flex items-center space-x-2">
                                            {/* context dropdown */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowContextDropdown(!showContextDropdown)}
                                                    className="action-button dropdown"
                                                >
                                                    <span>{getContextLabel(currentContext)}</span>
                                                </button>
                                                {showContextDropdown && (
                                                    <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]">
                                                        {contextOptions.map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => {
                                                                    setCurrentContext(option.value);
                                                                    setShowContextDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${currentContext === option.value ? 'bg-primary-50 text-primary-600' : 'text-gray-700'
                                                                    }`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* icon buttons */}
                                            <div className="icon-buttons">
                                                <button
                                                    onClick={() => {
                                                        setCurrentContext('calendar');
                                                        setInputMessage('Show my upcoming calendar events');
                                                    }}
                                                    className="icon-button"
                                                    title="Calendar"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        setCurrentContext('contacts');
                                                        setInputMessage('Show my contacts');
                                                    }}
                                                    className="icon-button"
                                                    title="Contacts"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={toggleVoiceRecording}
                                                    className={`mic-button ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
                                                    title={isRecording ? 'Stop recording' : 'Start voice input'}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={sendMessage}
                                                    disabled={!inputMessage.trim() || isLoading}
                                                    className="btn-primary"
                                                >
                                                    <Send className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* messages */}
                            <div className="chat-log">
                                <div className="text-center py-8">
                                    <p className="text-gray-600 mb-6">
                                        Welcome! Start a conversation by typing a message below.
                                    </p>
                                </div>
                            </div>

                            {/* input area for when no conversation exists yet */}
                            <div className="chat-input-area">
                                <div className="chat-input-container">
                                    <button
                                        onClick={() => {
                                            const fileInput = document.createElement('input');
                                            fileInput.type = 'file';
                                            fileInput.accept = 'image/*,text/*,.pdf,.doc,.docx';
                                            fileInput.onchange = (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (file) {
                                                    toast(`File selected: ${file.name}. File upload feature coming soon!`);
                                                }
                                            };
                                            fileInput.click();
                                        }}
                                        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
                                        title="Attach file"
                                    >
                                        <Plus className="h-5 w-5" />
                                    </button>
                                    <textarea
                                        value={inputMessage}
                                        onChange={(e) => {
                                            setInputMessage(e.target.value);
                                            e.target.style.height = 'auto';
                                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                        }}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask anything about your meetings..."
                                        className="chat-input-textarea"
                                        rows={1}
                                        disabled={isLoading}
                                    />

                                    <div className="input-actions">
                                        <div className="flex items-center space-x-2">
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowContextDropdown(!showContextDropdown)}
                                                    className="action-button dropdown"
                                                >
                                                    <span>{getContextLabel(currentContext)}</span>
                                                </button>
                                                {showContextDropdown && (
                                                    <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]">
                                                        {contextOptions.map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => {
                                                                    setCurrentContext(option.value);
                                                                    setShowContextDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${currentContext === option.value ? 'bg-primary-50 text-primary-600' : 'text-gray-700'
                                                                    }`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="icon-buttons">
                                                <button
                                                    onClick={() => {
                                                        setCurrentContext('calendar');
                                                        setInputMessage('Show my upcoming calendar events');
                                                    }}
                                                    className="icon-button"
                                                    title="Calendar"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        setCurrentContext('contacts');
                                                        setInputMessage('Show my contacts');
                                                    }}
                                                    className="icon-button"
                                                    title="Contacts"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={toggleVoiceRecording}
                                                    className={`mic-button ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
                                                    title={isRecording ? 'Stop recording' : 'Start voice input'}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                    </svg>
                                                </button>

                                                <button
                                                    onClick={sendMessage}
                                                    disabled={!inputMessage.trim() || isLoading}
                                                    className="btn-primary"
                                                >
                                                    <Send className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* history sidebar */}
                    {showHistory && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end">
                            <div className="w-80 bg-white h-full flex flex-col">
                                <div className="p-4 border-b border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-gray-900">History</h2>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={clearAllConversations}
                                                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 hover:border-red-300"
                                                title="Clear all conversations"
                                            >
                                                Clear All
                                            </button>
                                            <button
                                                onClick={() => setShowHistory(false)}
                                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    {conversations.map((conversation) => (
                                        <div
                                            key={conversation.id}
                                            onClick={() => loadConversation(conversation.id)}
                                            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 group ${currentConversation?.id === conversation.id ? 'bg-primary-50 border-primary-200' : ''
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-medium text-gray-900 truncate">
                                                        {conversation.title}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {new Date(conversation.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={(e) => deleteConversation(conversation.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* new conversation modal */}
                    {showNewConversation && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 w-96">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Start New Conversation
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    Begin a new conversation with your AI assistant
                                </p>
                                <div className="flex space-x-3">
                                    <button
                                        onClick={() => createNewConversation()}
                                        className="btn-primary flex-1"
                                    >
                                        Create
                                    </button>
                                    <button
                                        onClick={() => setShowNewConversation(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* settings modal */}
                    {showSettings && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 w-96">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    Chat Settings
                                </h3>

                                <div className="space-y-4">
                                    {/* Show Debug Info toggle */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm font-medium text-gray-900">Show Debug Info</label>
                                            <p className="text-sm text-gray-500">Display tool calls and detailed execution info</p>
                                        </div>
                                        <button
                                            onClick={() => setShowDebugInfo(!showDebugInfo)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showDebugInfo ? 'bg-primary-600' : 'bg-gray-200'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showDebugInfo ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>

                                    {/* auto sync toggle */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm font-medium text-gray-900">Auto Sync</label>
                                            <p className="text-sm text-gray-500">Automatically sync data every 5 minutes</p>
                                        </div>
                                        <button
                                            onClick={() => setAutoSync(!autoSync)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSync ? 'bg-primary-600' : 'bg-gray-200'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoSync ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>


                                    {/* webhook/polling selection */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="text-sm font-medium text-gray-900">Use Webhooks</label>
                                            <p className="text-sm text-gray-500">Use webhooks instead of polling for real-time updates</p>
                                        </div>
                                        <button
                                            onClick={() => setUseWebhooks(!useWebhooks)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useWebhooks ? 'bg-primary-600' : 'bg-gray-200'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useWebhooks ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex space-x-3 mt-6">
                                    <button
                                        onClick={() => {
                                            saveSettings();
                                            setShowSettings(false);
                                        }}
                                        className="btn-primary flex-1"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="btn-secondary flex-1"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Chat;