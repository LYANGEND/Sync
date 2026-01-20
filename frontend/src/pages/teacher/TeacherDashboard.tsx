import { useState, useEffect } from 'react';
import { BookOpen, Users, Calendar, CheckCircle, Clock } from 'lucide-react';
import TeacherHomework from './TeacherHomework';
import api from '../../services/api';

const TeacherDashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'homework' | 'resources'>('overview');
  const [stats, setStats] = useState({
    classes: 0,
    students: 0,
    pendingHomework: 0,
    todayClasses: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard');
      // Update with actual stats from API
      setStats({
        classes: response.data.totalClasses || 0,
        students: response.data.totalStudents || 0,
        pendingHomework: 0,
        todayClasses: 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Teacher Portal</h1>
          <p className="text-slate-600 mt-1">Manage your classes and homework</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-4 border-b-2 font-medium ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('homework')}
              className={`py-3 px-4 border-b-2 font-medium ${
                activeTab === 'homework'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Homework
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={`py-3 px-4 border-b-2 font-medium ${
                activeTab === 'resources'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Resources
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'overview' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg p-6 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">My Classes</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.classes}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Total Students</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.students}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Pending Grading</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.pendingHomework}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Today's Classes</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.todayClasses}</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab('homework')}
                  className="p-4 border rounded-lg hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Post Homework</p>
                      <p className="text-sm text-slate-600">Create new assignment</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('resources')}
                  className="p-4 border rounded-lg hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Upload Resource</p>
                      <p className="text-sm text-slate-600">Share study materials</p>
                    </div>
                  </div>
                </button>

                <button className="p-4 border rounded-lg hover:bg-slate-50 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Record Attendance</p>
                      <p className="text-sm text-slate-600">Mark today's attendance</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'homework' && <TeacherHomework />}

        {activeTab === 'resources' && (
          <div className="p-6">
            <div className="bg-white rounded-lg border p-12 text-center">
              <BookOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Resources Coming Soon</h3>
              <p className="text-slate-600">Upload and manage study materials for your students</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
