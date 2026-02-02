import { useState, useEffect } from 'react';
import { User, BookOpen, CheckCircle, Clock, AlertCircle, Calendar, ClipboardList, FileText, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ParentHomework from './ParentHomework';
import ParentQuizzes from './ParentQuizzes';
import ParentTimetable from './ParentTimetable';
import ParentGrades from './ParentGrades';
import ParentVideoLessons from './ParentVideoLessons';
import api from '../../services/api';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
  classId: string;
  pendingHomework?: number;
  averageGrade?: number;
}

const ParentDashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'homework' | 'quizzes' | 'grades' | 'timetable' | 'video-lessons'>('overview');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchChildren();
  }, []);

  const fetchChildren = async () => {
    try {
      setLoading(true);
      const response = await api.get('/parent/children');
      setChildren(response.data.children || []);
      if (response.data.children?.length > 0) {
        setSelectedChild(response.data.children[0]);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Parent Portal</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Monitor your children's progress</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white dark:bg-slate-800 border-b dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('homework')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap ${
                activeTab === 'homework'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Homework
            </button>
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap ${
                activeTab === 'quizzes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Quizzes & Tests
            </button>
            <button
              onClick={() => setActiveTab('grades')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap ${
                activeTab === 'grades'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Grades
            </button>
            <button
              onClick={() => setActiveTab('timetable')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap ${
                activeTab === 'timetable'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Timetable
            </button>
            <button
              onClick={() => setActiveTab('video-lessons')}
              className={`py-3 px-4 border-b-2 font-medium whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'video-lessons'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Live Lessons
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'overview' && (
          <div className="p-6">
            {/* Family Summary */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Family Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{children.length}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Children</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {children.reduce((sum, child) => sum + (child.pendingHomework || 0), 0)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Pending Homework</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {children.length > 0
                      ? Math.round(
                          children.reduce((sum, child) => sum + (child.averageGrade || 0), 0) /
                            children.length
                        )
                      : 0}
                    %
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Family Average</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">0</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Upcoming Tests</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <button
                onClick={() => setActiveTab('homework')}
                className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mb-3">
                  <BookOpen className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="font-medium text-slate-900 dark:text-white">Homework</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">View & submit</p>
              </button>

              <button
                onClick={() => setActiveTab('quizzes')}
                className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-3">
                  <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-medium text-slate-900 dark:text-white">Quizzes</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Take online tests</p>
              </button>

              <button
                onClick={() => setActiveTab('grades')}
                className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-medium text-slate-900 dark:text-white">Grades</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Report cards</p>
              </button>

              <button
                onClick={() => setActiveTab('timetable')}
                className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
                  <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-medium text-slate-900 dark:text-white">Timetable</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Class schedule</p>
              </button>

              <button
                onClick={() => setActiveTab('video-lessons')}
                className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-3">
                  <Video className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="font-medium text-slate-900 dark:text-white">Live Lessons</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Join video classes</p>
              </button>
            </div>

            {/* Children Cards */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your Children</h2>
              {loading ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading...</div>
              ) : children.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
                  <User className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Children Found</h3>
                  <p className="text-slate-600 dark:text-slate-400">Please contact the school to link your children to your account</p>
                </div>
              ) : (
                children.map((child) => (
                  <div key={child.id} className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">
                            {child.firstName} {child.lastName}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{child.grade}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedChild(child);
                          setActiveTab('homework');
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        View Details
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          <p className="text-lg font-bold text-orange-900 dark:text-orange-300">
                            {child.pendingHomework || 0}
                          </p>
                        </div>
                        <p className="text-xs text-orange-700 dark:text-orange-400">Pending Homework</p>
                      </div>

                      <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <p className="text-lg font-bold text-green-900 dark:text-green-300">
                            {child.averageGrade || 0}%
                          </p>
                        </div>
                        <p className="text-xs text-green-700 dark:text-green-400">Average Grade</p>
                      </div>

                      <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <p className="text-lg font-bold text-blue-900 dark:text-blue-300">0</p>
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-400">Upcoming Tests</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'homework' && <ParentHomework />}

        {activeTab === 'quizzes' && <ParentQuizzes />}

        {activeTab === 'grades' && <ParentGrades />}

        {activeTab === 'timetable' && <ParentTimetable />}

        {activeTab === 'video-lessons' && <ParentVideoLessons />}
      </div>
    </div>
  );
};

export default ParentDashboard;
