import React from 'react';

interface MeetingCardProps {
    date: string;
    timeRange: string;
    title: string;
    attendees: Array<{
        name: string;
        email?: string;
        avatar?: string;
    }>;
    onClick?: () => void;
}

function MeetingCard({ date, timeRange, title, attendees, onClick }: MeetingCardProps) {
    const getAvatarInitials = (name: string) => {
        return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase();
    };

    const getAvatarColor = (name: string) => {
        // Generate consistent colors based on name
        const colors = [
            'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500',
            'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-gray-500'
        ];
        const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
        return colors[index];
    };

    return (
        <div className="mb-4">
            {/* Date Header */}
            <div className="text-sm font-medium text-gray-900 mb-2">
                {date}
            </div>
            
            {/* Meeting Card */}
            <div 
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={onClick}
            >
                {/* Time Range */}
                <div className="text-sm text-gray-600 mb-2">
                    {timeRange}
                </div>
                
                {/* Meeting Title */}
                <div className="font-medium text-gray-900 mb-3">
                    {title}
                </div>
                
                {/* Attendee Avatars */}
                <div className="flex items-center space-x-1">
                    {attendees.slice(0, 5).map((attendee, index) => (
                        <div
                            key={index}
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium ${getAvatarColor(attendee.name)}`}
                            title={attendee.name}
                        >
                            {attendee.avatar ? (
                                <img
                                    src={attendee.avatar}
                                    alt={attendee.name}
                                    className="w-full h-full rounded-full object-cover"
                                />
                            ) : (
                                getAvatarInitials(attendee.name)
                            )}
                        </div>
                    ))}
                    {attendees.length > 5 && (
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium">
                            +{attendees.length - 5}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MeetingCard;