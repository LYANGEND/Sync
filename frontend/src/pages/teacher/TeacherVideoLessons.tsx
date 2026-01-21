import { useState, useEffect } from 'react';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  Play,
  Square,
  Trash2,
  Edit,
  X,
  ExternalLink,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api from '../../services/api';

interface VideoLesson {
  id: string;
  title: string;
  description?: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  roomId: string;
  roomPassword?: string;
  isRecordingEnabled: boolean;
  class: { id: string; name: string };
  subject: { id: string; name: string };
  _count?: { attendees: number };
}

interface ClassOption {
  id: string;
  name: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

const TeacherVideoLessons = () => {
  const [lessons, setLessons] = useState<VideoLesson[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<VideoLesson | null>(null);
  const [activeLesson, setActiveLesson] = useState<VideoLesson | null>(null);
  const [showJitsi, setShowJitsi] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    classId: '',
    subjectId: '',
    scheduledStart: '',
    scheduledEnd: '',
    roomPassword: '',
    isRecordingEnabled: false,
  });

  useEffect(() => {
    fetchLessons();
    fetchClasses();
    fetchSubjects();
  }, []);

  const fetchLessons = async () => {
    try {
      setLoading(true);
      const response = await api.get('/video-lessons/teacher');
      setLessons(response.data);
    } catch (error) {
      console.error('Failed to fetch lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingLesson) {
        await api.patch(`/video-lessons/${editingLesson.id}`, formData);
      } else {
        await api.post('/video-lessons', formData);
      }
      setShowModal(false);
      resetForm();
      fetchLessons();
    } catch (error) {
      console.error('Failed to save lesson:', error);
      alert('Failed to save video lesson');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      classId: '',
      subjectId: '',
      scheduledStart: '',
      scheduledEnd: '',
      roomPassword: '',
      isRecordingEnabled: false,
    });
    setEditingLesson(null);
  };

  const openEditModal = (lesson: VideoLesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title,
      description: lesson.description || '',
      classId: lesson.class.id,
      subjectId: lesson.subject.id,
      scheduledStart: new Date(lesson.scheduledStart).toISOString().slice(0, 16),
      scheduledEnd: new Date(lesson.scheduledEnd).toISOString().slice(0, 16),
      roomPassword: lesson.roomPassword || '',
      isRecordingEnabled: lesson.isRecordingEnabled,
    });
    setShowModal(true);
  };

  const handleStartLesson = async (lesson: VideoLesson) => {
    try {
      await api.post(`/video-lessons/${lesson.id}/start`);
      setActiveLesson(lesson);
      setShowJitsi(true);
      fetchLessons();
    } catch (error) {
      console.error('Failed to start lesson:', error);
      alert('Failed to start lesson');
    }
  };

  const handleEndLesson = async (lessonId: string) => {
    try {
      await api.post(`/video-lessons/${lessonId}/end`);
      setShowJitsi(false);
      setActiveLesson(null);
      fetchLessons();
    } catch (error) {
      console.error('Failed to end lesson:', error);
    }
  };

  const handleCancelLesson = async (lessonId: string) => {
    if (!confirm('Are you sure you want to cancel this lesson?')) return;
    try {
      await api.post(`/video-lessons/${lessonId}/cancel`);
      fetchLessons();
    } catch (error) {
      console.error('Failed to cancel lesson:', error);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    try {
      await api.delete(`/video-lessons/${lessonId}`);
      fetchLessons();
    } catch (error) {
      console.error('Failed to delete lesson:', error);
    }
  };

  const openJitsiWindow = (lesson: VideoLesson) => {
    const jitsiUrl = `https://meet.jit.si/${lesson.roomId}`;
    window.open(jitsiUrl, '_blank', 'width=1200,height=800');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs font-medium">
            Scheduled
          </span>
        );
      case 'LIVE':
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full text-xs font-medium animate-pulse">
            🔴 Live
          </span>
        );
      case 'ENDED':
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-medium">
            Ended
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-full text-xs font-medium">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const scheduledLessons = lessons.filter((l) => l.status === 'SCHEDULED');
  const liveLessons = lessons.filter((l) => l.status === 'LIVE');
  const pastLessons = lessons.filter((l) => l.status === 'ENDED' || l.status === 'CANCELLED');

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Video Lessons</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Schedule and host online video lessons
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Schedule Lesson
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Live Now</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {liveLessons.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <Video className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Scheduled</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {scheduledLessons.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Completed</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {pastLessons.filter((l) => l.status === 'ENDED').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Lessons</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{lessons.length}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Video className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Live Lessons Alert */}
      {liveLessons.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">
            🔴 Live Lessons in Progress
          </h3>
          <div className="space-y-2">
            {liveLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-lg"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{lesson.title}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {lesson.class.name} • {lesson.subject.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openJitsiWindow(lesson)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Rejoin
                  </button>
                  <button
                    onClick={() => handleEndLesson(lesson.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                  >
                    <Square className="w-4 h-4" />
                    End
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Lessons */}
      {scheduledLessons.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 mb-6">
          <div className="p-4 border-b dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">Upcoming Lessons</h2>
          </div>
          <div className="divide-y dark:divide-slate-700">
            {scheduledLessons.map((lesson) => (
              <div key={lesson.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        {lesson.title}
                      </h3>
                      {getStatusBadge(lesson.status)}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                      {lesson.class.name} • {lesson.subject.name}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(lesson.scheduledStart).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(lesson.scheduledStart).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        -{' '}
                        {new Date(lesson.scheduledEnd).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartLesson(lesson)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                    >
                      <Play className="w-4 h-4" />
                      Start
                    </button>
                    <button
                      onClick={() => openEditModal(lesson)}
                      className="p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCancelLesson(lesson.id)}
                      className="p-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteLesson(lesson.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Lessons */}
      {pastLessons.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
          <div className="p-4 border-b dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-white">Past Lessons</h2>
          </div>
          <div className="divide-y dark:divide-slate-700">
            {pastLessons.slice(0, 10).map((lesson) => (
              <div key={lesson.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900 dark:text-white">{lesson.title}</h3>
                      {getStatusBadge(lesson.status)}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {lesson.class.name} • {lesson.subject.name} •{' '}
                      {new Date(lesson.scheduledStart).toLocaleDateString()}
                    </p>
                  </div>
                  {lesson._count && (
                    <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                      <Users className="w-4 h-4" />
                      {lesson._count.attendees} attended
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && lessons.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
          <Video className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No Video Lessons Yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Schedule your first online video lesson for your students.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Schedule Lesson
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingLesson ? 'Edit Video Lesson' : 'Schedule Video Lesson'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  placeholder="e.g., Math - Chapter 5 Review"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  rows={2}
                  placeholder="Brief description of what will be covered..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Class *
                  </label>
                  <select
                    required
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Subject *
                  </label>
                  <select
                    required
                    value={formData.subjectId}
                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.scheduledStart}
                    onChange={(e) => setFormData({ ...formData, scheduledStart: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    End Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.scheduledEnd}
                    onChange={(e) => setFormData({ ...formData, scheduledEnd: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Room Password (Optional)
                </label>
                <input
                  type="text"
                  value={formData.roomPassword}
                  onChange={(e) => setFormData({ ...formData, roomPassword: e.target.value })}
                  className="w-full px-3 py-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  placeholder="Leave empty for no password"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recording"
                  checked={formData.isRecordingEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, isRecordingEnabled: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label
                  htmlFor="recording"
                  className="text-sm text-slate-700 dark:text-slate-300"
                >
                  Enable recording (students can watch later)
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingLesson ? 'Update' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Jitsi Embed (Full Screen Overlay) */}
      {showJitsi && activeLesson && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="bg-slate-900 px-4 py-2 flex items-center justify-between">
            <div className="text-white">
              <h3 className="font-semibold">{activeLesson.title}</h3>
              <p className="text-sm text-slate-400">
                {activeLesson.class.name} • {activeLesson.subject.name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openJitsiWindow(activeLesson)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Open in New Window
              </button>
              <button
                onClick={() => handleEndLesson(activeLesson.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm"
              >
                <Square className="w-4 h-4" />
                End Lesson
              </button>
            </div>
          </div>
          <iframe
            src={`https://meet.jit.si/${activeLesson.roomId}#config.prejoinPageEnabled=false&userInfo.displayName=Teacher`}
            className="flex-1 w-full"
            allow="camera; microphone; fullscreen; display-capture; autoplay"
          />
        </div>
      )}
    </div>
  );
};

export default TeacherVideoLessons;
