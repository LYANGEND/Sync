import { useState, useEffect } from 'react';
import { User, BookOpen, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import ParentHomework from './ParentHomework';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'homework' | 'grades' | 'attendance'>('overview');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Parent Portal</h1>
          <p className="text-slate-600 mt-1">Monitor your children's progress</p>
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
              onClick={() => setActiveTab('grades')}
              className={`py-3 px-4 border-b-2 font-medium ${
                activeTab === 'grades'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Grades
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`py-3 px-4 border-b-2 font-medium ${
                activeTab === 'attendance'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Attendance
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'overview' && (
          <div className="p-6">
            {/* Family Summary */}
            <div className="bg-white rounded-lg border p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Family Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900">{children.length}</p>
                  <p className="text-sm text-slate-600">Children</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900">
                    {children.reduce((sum, child) => sum + (child.pendingHomework || 0), 0)}
                  </p>
                  <p className="text-sm text-slate-600">Pending Homework</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900">
                    {children.length > 0
                      ? Math.round(
                          children.reduce((sum, child) => sum + (child.averageGrade || 0), 0) /
                            children.length
                        )
                      : 0}
                    %
                  </p>
                  <p className="text-sm text-slate-600">Family Average</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900">0</p>
                  <p className="text-sm text-slate-600">Upcoming Tests</p>
                </div>
              </div>
            </div>

            {/* Children Cards */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Your Children</h2>
              {loading ? (
                <div className="text-center py-12 text-slate-500">Loading...</div>
              ) : children.length === 0 ? (
                <div className="bg-white rounded-lg border p-12 text-center">
                  <User className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Children Found</h3>
                  <p className="text-slate-600">Please contact the school to link your children to your account</p>
                </div>
              ) : (
                children.map((child) => (
                  <div key={child.id} className="bg-white rounded-lg border p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {child.firstName} {child.lastName}
                          </h3>
                          <p className="text-sm text-slate-600">{child.grade}</p>
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
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Clock className="w-4 h-4 text-orange-600" />
                          <p className="text-lg font-bold text-orange-900">
                            {child.pendingHomework || 0}
                          </p>
                        </div>
                        <p className="text-xs text-orange-700">Pending Homework</p>
                      </div>

                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <p className="text-lg font-bold text-green-900">
                            {child.averageGrade || 0}%
                          </p>
                        </div>
                        <p className="text-xs text-green-700">Average Grade</p>
                      </div>

                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <BookOpen className="w-4 h-4 text-blue-600" />
                          <p className="text-lg font-bold text-blue-900">0</p>
                        </div>
                        <p className="text-xs text-blue-700">Upcoming Tests</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'homework' && <ParentHomework />}

        {activeTab === 'grades' && (
          <div className="p-6">
            <div className="bg-white rounded-lg border p-12 text-center">
              <CheckCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Grades Coming Soon</h3>
              <p className="text-slate-600">View your child's grades and progress reports</p>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="p-6">
            <div className="bg-white rounded-lg border p-12 text-center">
              <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Attendance Coming Soon</h3>
              <p className="text-slate-600">Track your child's attendance record</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
