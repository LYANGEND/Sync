import React, { useState, useEffect } from 'react';
import {
  Video,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Play,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Bell,
  User,
} from 'lucide-react';
import api from '../../services/api';

interface VideoLesson {
  id: string;
  title: string;
  description: string | null;
  roomId: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  teacher: {
    id: string;
    name: string;
  };
  class: {
    id: string;
    name: string;
  };
  subject: {
    id: string;
    name: string;
  };
  _count?: {
    attendees: number;
  };
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
}

const ParentVideoLessons: React.FC = () => {
  const [lessons, setLessons] = useState<VideoLesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLesson, setActiveLesson] = useState<VideoLesson | null>(null);
  const [showJitsi, setShowJitsi] = useState(false);
  const [joiningLesson, setJoiningLesson] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      fetchLessons();
      // Poll for lesson updates every 30 seconds
      const interval = setInterval(fetchLessons, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedStudentId]);

  const fetchStudents = async () => {
    try {
      const response = await api.get('/students/my-children');
      const studentList = response.data || [];
      setStudents(studentList);
      if (studentList.length > 0) {
        setSelectedStudentId(studentList[0].id);
      }
    } catch (err: any) {
      console.error('Failed to fetch students:', err);
      setError('Failed to load students');
    }
  };

  const fetchLessons = async () => {
    if (!selectedStudentId) return;
    
    try {
      setLoading(true);
      const response = await api.get('/video-lessons/student', {
        params: { studentId: selectedStudentId },
      });
      setLessons(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch video lessons:', err);
      setError(err.response?.data?.error || 'Failed to load video lessons');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLesson = async (lesson: VideoLesson) => {
    if (lesson.status !== 'LIVE') {
      return;
    }

    setJoiningLesson(lesson.id);
    try {
      await api.post(`/video-lessons/${lesson.id}/join`, {
        studentId: selectedStudentId,
      });
      setActiveLesson(lesson);
      setShowJitsi(true);
    } catch (err: any) {
      console.error('Failed to join lesson:', err);
      alert(err.response?.data?.error || 'Failed to join lesson');
    } finally {
      setJoiningLesson(null);
    }
  };

  const handleLeaveLesson = async () => {
    if (!activeLesson) return;

    try {
      await api.post(`/video-lessons/${activeLesson.id}/leave`, {
        studentId: selectedStudentId,
      });
    } catch (err) {
      console.error('Failed to record leave:', err);
    }
    
    setShowJitsi(false);
    setActiveLesson(null);
    fetchLessons();
  };

  const openInNewWindow = () => {
    if (!activeLesson) return;
    
    const student = students.find(s => s.id === selectedStudentId);
    const displayName = student ? `${student.firstName} ${student.lastName}` : 'Student';
    const jitsiUrl = `https://meet.jit.si/${activeLesson.roomId}#userInfo.displayName="${encodeURIComponent(displayName)}"`;
    window.open(jitsiUrl, '_blank', 'width=1200,height=800');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeUntilStart = (scheduledStart: string) => {
    const now = new Date();
    const start = new Date(scheduledStart);
    const diffMs = start.getTime() - now.getTime();
    
    if (diffMs < 0) return null;
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    if (diffHours > 0) return `In ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffMins > 0) return `In ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    return 'Starting soon';
  };

  const getStatusBadge = (lesson: VideoLesson) => {
    switch (lesson.status) {
      case 'LIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full animate-pulse">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
            LIVE NOW
          </span>
        );
      case 'SCHEDULED':
        const timeUntil = getTimeUntilStart(lesson.scheduledStart);
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
            <Clock className="w-3 h-3" />
            {timeUntil || 'Scheduled'}
          </span>
        );
      case 'ENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-full">
            <CheckCircle className="w-3 h-3" />
            Ended
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded-full">
            Cancelled
          </span>
        );
    }
  };

  // Separate lessons by status
  const liveLessons = lessons.filter(l => l.status === 'LIVE');
  const upcomingLessons = lessons.filter(l => l.status === 'SCHEDULED');
  const pastLessons = lessons.filter(l => l.status === 'ENDED' || l.status === 'CANCELLED');

  if (showJitsi && activeLesson) {
    const student = students.find(s => s.id === selectedStudentId);
    const displayName = student ? `${student.firstName} ${student.lastName}` : 'Student';
    const jitsiUrl = `https://meet.jit.si/${activeLesson.roomId}#userInfo.displayName="${encodeURIComponent(displayName)}"&config.prejoinPageEnabled=false`;

    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <Video className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {activeLesson.title}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {activeLesson.subject.name} • {activeLesson.teacher.name}
                  </p>
                </div>
                <span className="ml-4 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full animate-pulse">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openInNewWindow}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Window
                </button>
                <button
                  onClick={handleLeaveLesson}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Leave Lesson
                </button>
              </div>
            </div>
          </div>

          {/* Jitsi Embed */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
            <iframe
              src={jitsiUrl}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-full border-0"
              title="Video Lesson"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <Video className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Video Lessons
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Join live lessons with your teachers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Student Selector */}
            {students.length > 1 && (
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500"
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={fetchLessons}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        {loading && lessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-purple-600 animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading video lessons...</p>
          </div>
        ) : lessons.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
            <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Video Lessons
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              There are no video lessons scheduled yet. Check back later!
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Live Lessons Alert */}
            {liveLessons.length > 0 && (
              <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <Bell className="w-6 h-6 animate-bounce" />
                  <h2 className="text-xl font-bold">
                    {liveLessons.length} Live Lesson{liveLessons.length > 1 ? 's' : ''} Now!
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {liveLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="bg-white/10 backdrop-blur-sm rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold">{lesson.title}</h3>
                          <p className="text-sm text-white/80">
                            {lesson.subject.name} • {lesson.teacher.name}
                          </p>
                          {lesson._count && (
                            <p className="text-xs text-white/70 mt-1">
                              <Users className="w-3 h-3 inline mr-1" />
                              {lesson._count.attendees} attending
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleJoinLesson(lesson)}
                          disabled={joiningLesson === lesson.id}
                          className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 rounded-lg font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
                        >
                          {joiningLesson === lesson.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Join Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Lessons */}
            {upcomingLessons.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Upcoming Lessons
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {upcomingLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                    >
                      <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500" />
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {lesson.title}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {lesson.subject.name}
                              </span>
                            </div>
                          </div>
                          {getStatusBadge(lesson)}
                        </div>

                        {lesson.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                            {lesson.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <User className="w-4 h-4" />
                          <span>{lesson.teacher.name}</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(lesson.scheduledStart)}</span>
                          <Clock className="w-4 h-4 ml-2" />
                          <span>
                            {formatTime(lesson.scheduledStart)} - {formatTime(lesson.scheduledEnd)}
                          </span>
                        </div>

                        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {lesson.class.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Past Lessons */}
            {pastLessons.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-gray-500" />
                  Past Lessons
                </h2>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {pastLessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                            <Video className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {lesson.title}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {lesson.subject.name} • {lesson.teacher.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-gray-900 dark:text-white">
                              {formatDate(lesson.scheduledStart)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatTime(lesson.scheduledStart)}
                            </p>
                          </div>
                          {getStatusBadge(lesson)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentVideoLessons;
