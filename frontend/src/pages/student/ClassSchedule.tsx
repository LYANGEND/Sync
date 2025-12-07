import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Video, Users, AlertCircle } from 'lucide-react';
import api from '../../utils/api';

interface ClassSession {
  id: string;
  title: string;
  description?: string;
  subject: { name: string };
  teacher: { fullName: string };
  scheduledStart: string;
  scheduledEnd: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  type: 'LIVE_CLASS' | 'RECORDED_LESSON' | 'HYBRID';
  _count: {
    participants: number;
  };
}

const ClassSchedule: React.FC = () => {
  const [upcomingClasses, setUpcomingClasses] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUpcomingClasses();
    
    // Refresh every minute to update "starts in" times
    const interval = setInterval(fetchUpcomingClasses, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchUpcomingClasses = async () => {
    try {
      const response = await api.get('/live-classes/my-classes');
      setUpcomingClasses(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      setLoading(false);
    }
  };

  const getTimeUntilClass = (scheduledStart: string) => {
    const now = new Date();
    const start = new Date(scheduledStart);
    const diff = start.getTime() - now.getTime();

    if (diff < 0) return 'Started';

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
    return 'Starting now';
  };

  const canJoinClass = (session: ClassSession) => {
    const now = new Date();
    const start = new Date(session.scheduledStart);
    const minutesUntilStart = (start.getTime() - now.getTime()) / 60000;

    // Can join 5 minutes before or if already live
    return minutesUntilStart <= 5 || session.status === 'LIVE';
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      SCHEDULED: 'bg-blue-100 text-blue-800',
      LIVE: 'bg-red-100 text-red-800 animate-pulse',
      ENDED: 'bg-gray-100 text-gray-800',
      CANCELLED: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {status === 'LIVE' && '🔴 '}{status}
      </span>
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">My Class Schedule</h1>
        <p className="text-gray-600">Upcoming live classes and sessions</p>
      </div>

      {/* Classes List */}
      {upcomingClasses.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Calendar size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Upcoming Classes</h3>
          <p className="text-gray-600">Check back later for scheduled classes</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingClasses.map((session) => {
            const canJoin = canJoinClass(session);
            const timeUntil = getTimeUntilClass(session.scheduledStart);

            return (
              <div
                key={session.id}
                className={`bg-white rounded-lg shadow-sm p-6 ${
                  session.status === 'LIVE' ? 'border-2 border-red-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-800">
                        {session.title}
                      </h3>
                      {getStatusBadge(session.status)}
                    </div>

                    {session.description && (
                      <p className="text-gray-600 mb-3">{session.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={16} />
                        {formatDate(session.scheduledStart)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={16} />
                        {formatTime(session.scheduledStart)} - {formatTime(session.scheduledEnd)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={16} />
                        {session._count.participants} joined
                      </span>
                      <span className="font-medium text-blue-600">
                        {session.subject.name}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-gray-500">
                      Teacher: {session.teacher.fullName}
                    </div>
                  </div>

                  <div className="ml-4 text-right">
                    {session.status === 'LIVE' ? (
                      <div className="mb-2">
                        <span className="text-red-600 font-semibold text-lg">LIVE NOW</span>
                      </div>
                    ) : session.status === 'SCHEDULED' ? (
                      <div className="mb-2">
                        <span className="text-gray-600 font-medium">{timeUntil}</span>
                      </div>
                    ) : null}

                    {canJoin && session.status !== 'ENDED' && session.status !== 'CANCELLED' ? (
                      <button
                        onClick={() => navigate(`/student/live-class/${session.id}`)}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
                      >
                        <Video size={20} />
                        Join Class
                      </button>
                    ) : session.status === 'ENDED' ? (
                      <button
                        disabled
                        className="px-6 py-3 bg-gray-300 text-gray-600 rounded-lg cursor-not-allowed"
                      >
                        Class Ended
                      </button>
                    ) : session.status === 'CANCELLED' ? (
                      <div className="flex items-center gap-2 text-yellow-600">
                        <AlertCircle size={20} />
                        <span className="font-medium">Cancelled</span>
                      </div>
                    ) : (
                      <button
                        disabled
                        className="px-6 py-3 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed text-sm"
                      >
                        Join 5 min before
                      </button>
                    )}
                  </div>
                </div>

                {session.status === 'LIVE' && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                    <AlertCircle size={20} />
                    <span className="font-medium">Class is in progress! Join now to not miss out.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClassSchedule;
