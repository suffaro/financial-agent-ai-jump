import React, { useState } from 'react';
import { X, Settings, Plus, Mic } from 'lucide-react';

interface Meeting {
  id: string;
  title: string;
  time: string;
  attendees: Array<{ name: string; avatar: string }>;
  date: string;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIMeetingChatProps {
  onClose?: () => void;
}

const AIMeetingChat: React.FC<AIMeetingChatProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [inputText, setInputText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'I can answer questions about any Jump meeting. What do you want to know?',
      timestamp: new Date()
    },
    {
      id: '2',
      type: 'user',
      content: 'Find meetings I\'ve had with Bill and Tim this month',
      timestamp: new Date()
    },
    {
      id: '3',
      type: 'assistant',
      content: 'Sure, here are some recent meetings that you, Bill, and Tim all attended. I found 2 in May.',
      timestamp: new Date()
    }
  ]);

  const mockMeetings: Meeting[] = [
    {
      id: '1',
      title: 'Quarterly All Team Meeting',
      time: '12 - 1:30pm',
      date: '8 Thursday',
      attendees: [
        { name: 'Bill', avatar: '👨‍💼' },
        { name: 'Tim', avatar: '👨‍💻' },
        { name: 'Sarah', avatar: '👩‍💼' },
        { name: 'Mike', avatar: '👨‍🔬' },
        { name: 'Lisa', avatar: '👩‍💻' }
      ]
    },
    {
      id: '2',
      title: 'Strategy review',
      time: '1 - 2pm',
      date: '16 Friday',
      attendees: [
        { name: 'Bill', avatar: '👨‍💼' },
        { name: 'Tim', avatar: '👨‍💻' }
      ]
    }
  ];

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputText,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col h-screen w-full sm:max-w-md sm:mx-auto sm:border-x border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Ask Anything</h1>
        <div className="flex items-center space-x-3">
          <button className="p-1 hover:bg-gray-100 rounded">
            <Settings className="h-5 w-5 text-gray-600" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <div className="flex space-x-4 sm:space-x-6">
          <button
            onClick={() => setActiveTab('chat')}
            className={`pb-1 ${
              activeTab === 'chat'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-1 ${
              activeTab === 'history'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            History
          </button>
        </div>
        <button className="flex items-center space-x-1 text-xs sm:text-sm text-gray-600 hover:text-gray-800">
          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">New thread</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Context Display */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="text-center">
          <div className="text-sm text-gray-600">Context set to all meetings</div>
          <div className="text-xs text-gray-400">11:17am - May 13, 2025</div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs sm:max-w-sm px-3 py-2 rounded-lg text-sm ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Meeting Cards */}
        <div className="space-y-3">
          {mockMeetings.map((meeting) => (
            <div key={meeting.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="text-sm text-gray-500 mb-1">{meeting.date}</div>
                  <div className="text-sm text-gray-600 mb-1">{meeting.time}</div>
                  <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                </div>
              </div>
              <div className="flex items-center space-x-1 mt-2">
                {meeting.attendees.map((attendee, index) => (
                  <div
                    key={index}
                    className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs"
                    title={attendee.name}
                  >
                    {attendee.avatar}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-600 mt-4">
          I can summarize these meetings, schedule a follow up, and more!
        </div>
      </div>

      {/* Input Bar */}
      <div className="p-3 sm:p-4 border-t border-gray-200">
        <div className="flex items-end space-x-2">
          <button className="p-2 hover:bg-gray-100 rounded flex-shrink-0">
            <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything about your meetings..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
            />
          </div>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-1"
            >
              <span className="hidden sm:inline">All meetings</span>
              <span className="sm:hidden">All</span>
              <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {dropdownOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-40 sm:w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <button className="w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-50">All meetings</button>
                  <button className="w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-50">This week</button>
                  <button className="w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-50">This month</button>
                  <button className="w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-50">Custom range</button>
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:flex space-x-1">
            <button className="p-2 hover:bg-gray-100 rounded text-gray-400">
              <div className="w-4 h-4 rounded border border-gray-300"></div>
            </button>
            
            <button className="p-2 hover:bg-gray-100 rounded text-gray-400">
              <div className="w-4 h-4 rounded border border-gray-300"></div>
            </button>
          </div>

          <button className="p-2 hover:bg-gray-100 rounded flex-shrink-0">
            <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIMeetingChat;