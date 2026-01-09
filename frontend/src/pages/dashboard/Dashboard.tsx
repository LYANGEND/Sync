import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, AlertCircle, BookOpen, Clock, Calendar, CheckSquare, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';

// Admin Stats Interface
// ... (interfaces)
interface AdminStats {
  role: 'ADMIN';
  dailyRevenue: number;
  activeStudents: number;
  outstandingFees: number;
  recentPayments: {
    id: string;
    amount: number;
    method: string;
    createdAt: string;
    status?: 'COMPLETED' | 'VOIDED'; // Added status
    student: {
      firstName: string;
      lastName: string;
      class: {
        name: string;
      };
    };
  }[];
}



// Teacher Stats Interface
interface TeacherStats {
  role: 'TEACHER';
  stats: {
    totalStudents: number;
    totalClasses: number;
    todayScheduleCount: number;
  };
  myClasses: {
    id: string;
    name: string;
    gradeLevel: number;
    _count: { students: number };
  }[];
  todaySchedule: {
    id: string;
    startTime: string;
    endTime: string;
    class: { name: string };
    subject: { name: string; code: string };
  }[];
  recentAssessments: {
    id: string;
    title: string;
    date: string;
    class: { name: string };
    subject: { name: string };
    _count: { results: number };
  }[];
}

type DashboardData = AdminStats | TeacherStats;

const Dashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setData(response.data);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.role !== 'PARENT') {
      fetchStats();
    }
  }, [user]);

  if (user?.role === 'PARENT') {
    return <Navigate to="/my-children" replace />;
  }

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  // --- TEACHER VIEW ---
  if (data?.role === 'TEACHER') {
    const stats = (data as TeacherStats).stats;
    const { todaySchedule, recentAssessments, myClasses } = data as TeacherStats;

    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Teacher Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.name}. Here is your academic overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">My Students</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">My Classes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalClasses}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Lessons Today</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayScheduleCount}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today's Schedule */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Calendar size={20} className="text-blue-500" />
                Today's Schedule
              </h2>
              <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {todaySchedule.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No classes scheduled for today.</div>
              ) : (
                todaySchedule.map((period) => (
                  <div key={period.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                    <div className="text-center min-w-[80px]">
                      <div className="text-sm font-bold text-gray-900">{period.startTime}</div>
                      <div className="text-xs text-gray-400">{period.endTime}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-blue-900">{period.subject.name}</div>
                      <div className="text-xs text-gray-500">{period.class.name}</div>
                    </div>
                    <Link to="/academics/attendance" className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                      Attendance
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Assessments */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <CheckSquare size={20} className="text-green-500" />
                Recent Assessments
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {recentAssessments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No recent assessments found.</div>
              ) : (
                recentAssessments.map((assessment) => (
                  <div key={assessment.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                      <BookOpen size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{assessment.title}</div>
                      <div className="text-xs text-gray-500">
                        {assessment.class.name} • {assessment.subject.name} • {new Date(assessment.date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-gray-900">{assessment._count.results} Graded</div>
                      <Link to="/academics/gradebook" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Grade Now</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- ADMIN / BURSAR VIEW (Existing) ---
  const stats = data as AdminStats;
  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Dashboard Overview</h1>
        <p className="text-sm md:text-base text-gray-500">Welcome back, here's what's happening today.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link to="/students" className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-blue-50 transition-colors group">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-200">
            <Users size={20} />
          </div>
          <span className="text-sm font-medium text-gray-700">All Students</span>
        </Link>
        <Link to="/finance" className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-green-50 transition-colors group">
          <div className="p-2 bg-green-100 text-green-600 rounded-lg group-hover:bg-green-200">
            <TrendingUp size={20} />
          </div>
          <span className="text-sm font-medium text-gray-700">Finance</span>
        </Link>
        <Link to="/classes" className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-purple-50 transition-colors group">
          <div className="p-2 bg-purple-100 text-purple-600 rounded-lg group-hover:bg-purple-200">
            <BookOpen size={20} />
          </div>
          <span className="text-sm font-medium text-gray-700">Classes</span>
        </Link>
        <Link to="/attendance" className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-2 hover:bg-orange-50 transition-colors group">
          <div className="p-2 bg-orange-100 text-orange-600 rounded-lg group-hover:bg-orange-200">
            <CheckSquare size={20} />
          </div>
          <span className="text-sm font-medium text-gray-700">Attendance</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 text-green-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">Today</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Today's Collection</h3>
          <p className="text-2xl font-bold text-gray-900">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <AlertCircle size={24} />
            </div>
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">Total</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Outstanding Fees</h3>
          <p className="text-2xl font-bold text-gray-900">ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Users size={24} />
            </div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Active</span>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Active Students</h3>
          <p className="text-2xl font-bold text-gray-900">{stats?.activeStudents || '0'}</p>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Recent Payments</h2>
          <Link to="/finance" className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All</Link>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats?.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No recent payments found</td>
                </tr>
              ) : (
                stats?.recentPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {payment.student.firstName} {payment.student.lastName}
                    </td>
                    <td className="px-6 py-4">{payment.student.class?.name || 'N/A'}</td>
                    <td className={`px-6 py-4 ${payment.status === 'VOIDED' ? 'line-through text-gray-400' : ''}`}>
                      ZMW {Number(payment.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${payment.method === 'CASH' ? 'bg-green-100 text-green-800' :
                          payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'}`}>
                        {payment.method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-6 py-4">
                      {payment.status === 'VOIDED' ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Voided</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden">
          {stats?.recentPayments.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No recent payments found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats?.recentPayments.map((payment) => (
                <div key={payment.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{payment.student.firstName} {payment.student.lastName}</p>
                      <p className="text-sm text-gray-500">{payment.student.class?.name || 'N/A'}</p>
                    </div>
                    <span className={`font-bold ${payment.status === 'VOIDED' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      ZMW {Number(payment.amount).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${payment.method === 'CASH' ? 'bg-green-100 text-green-800' :
                        payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'}`}>
                      {payment.method.replace('_', ' ')}
                    </span>
                    <span className="text-gray-500">
                      {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {payment.status === 'VOIDED' && (
                    <div className="text-xs text-red-600 font-medium">Voided Transaction</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
