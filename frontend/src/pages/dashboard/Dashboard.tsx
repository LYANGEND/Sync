import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, AlertCircle, BookOpen, Clock, Calendar, CheckSquare, GraduationCap, Brain, Shield, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PullToRefresh, DashboardSkeleton, SwipeableCards } from '../../components/mobile';

// Admin Stats Interface
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
    status?: 'COMPLETED' | 'VOIDED';
    student: {
      firstName: string;
      lastName: string;
      class: {
        name: string;
      };
    };
  }[];
  intelligence?: {
    atRiskCount: number;
    unresolvedAlerts: number;
    attendanceRate: number;
  };
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
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'PARENT') {
      fetchStats();
    }
  }, [user, fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  if (user?.role === 'PARENT') {
    return <Navigate to="/my-children" replace />;
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  // --- TEACHER VIEW ---
  if (data?.role === 'TEACHER') {
    const stats = (data as TeacherStats).stats;
    const { todaySchedule = [], recentAssessments = [], myClasses = [] } = data as TeacherStats;

    return (
      <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Teacher Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Welcome back, {user?.fullName?.split(' ')[0]}. Here is your academic overview.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 md:gap-6 mb-6">
            <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-3">
                <Users size={20} className="md:w-6 md:h-6" />
              </div>
              <p className="text-[11px] md:text-sm text-gray-500 dark:text-gray-400 font-medium">My Students</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{stats.totalStudents}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-3">
                <GraduationCap size={20} className="md:w-6 md:h-6" />
              </div>
              <p className="text-[11px] md:text-sm text-gray-500 dark:text-gray-400 font-medium">My Classes</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{stats.totalClasses}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center mb-3">
                <Clock size={20} className="md:w-6 md:h-6" />
              </div>
              <p className="text-[11px] md:text-sm text-gray-500 dark:text-gray-400 font-medium">Today</p>
              <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{stats.todayScheduleCount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Schedule */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
              <div className="p-4 md:p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Calendar size={18} className="text-blue-500" />
                  Today's Schedule
                </h2>
                <span className="text-[10px] md:text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-slate-700">
                {todaySchedule.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No classes today.</div>
                ) : (
                  todaySchedule.map((period) => (
                    <div key={period.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-4 active:bg-gray-100 dark:active:bg-slate-700">
                      <div className="text-center min-w-[60px]">
                        <div className="text-sm font-bold text-gray-900 dark:text-white">{period.startTime}</div>
                        <div className="text-[10px] text-gray-400">{period.endTime}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-blue-900 dark:text-blue-400 truncate">{period.subject?.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{period.class?.name}</div>
                      </div>
                      <Link
                        to="/academics/attendance"
                        className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 active:bg-blue-200 transition-colors"
                      >
                        Mark
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Assessments */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
              <div className="p-4 md:p-6 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <CheckSquare size={18} className="text-green-500" />
                  Recent Assessments
                </h2>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-slate-700">
                {recentAssessments.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No recent assessments.</div>
                ) : (
                  recentAssessments.map((assessment) => (
                    <div key={assessment.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-4 active:bg-gray-100 dark:active:bg-slate-700">
                      <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center flex-shrink-0">
                        <BookOpen size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{assessment.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {assessment.class?.name} • {assessment.subject?.name}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-bold text-gray-900 dark:text-white">{assessment._count.results}</div>
                        <Link to="/academics/gradebook" className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Grade</Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </PullToRefresh>
    );
  }

  // --- ADMIN / BURSAR VIEW ---
  const stats = data as AdminStats;

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Welcome back, here's what's happening today.</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { icon: Users, label: 'Students', path: '/students', color: 'blue' },
            { icon: TrendingUp, label: 'Finance', path: '/finance', color: 'green' },
            { icon: BookOpen, label: 'Classes', path: '/classes', color: 'purple' },
            { icon: CheckSquare, label: 'Attendance', path: '/attendance', color: 'orange' },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className={`p-3 md:p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:bg-${action.color}-50 dark:hover:bg-slate-700 active:scale-95 transition-all group`}
            >
              <div className={`p-2 md:p-3 bg-${action.color}-100 dark:bg-${action.color}-900/30 text-${action.color}-600 dark:text-${action.color}-400 rounded-xl group-hover:bg-${action.color}-200 dark:group-hover:bg-${action.color}-900/50 transition-colors`}>
                <action.icon size={20} className="md:w-6 md:h-6" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-700 dark:text-gray-300 text-center">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Intelligence Summary */}
        {stats?.intelligence && (stats.intelligence.atRiskCount > 0 || stats.intelligence.unresolvedAlerts > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <Link
              to="/intelligence"
              className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            >
              <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-xl">
                <Shield size={20} className="text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{stats.intelligence.atRiskCount}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">At-Risk Students</p>
              </div>
            </Link>
            <Link
              to="/intelligence"
              className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-xl">
                <Bell size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{stats.intelligence.unresolvedAlerts}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Attendance Alerts</p>
              </div>
            </Link>
            <div
              className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800"
            >
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl">
                <Brain size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{stats.intelligence.attendanceRate}%</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Weekly Attendance</p>
              </div>
            </div>
          </div>
        )}


        {/* Stats Grid - Desktop */}
        <div className="hidden md:grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-sm text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">Today</span>
            </div>
            <h3 className="text-green-100 text-sm font-medium">Today's Collection</h3>
            <p className="text-3xl font-bold">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                <AlertCircle size={20} />
              </div>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">Outstanding</span>
            </div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Outstanding Fees</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                <Users size={20} />
              </div>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">Active</span>
            </div>
            <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Active Students</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.activeStudents || '0'}</p>
          </div>
        </div>

        {/* Stats Cards - Mobile (Swipeable) */}
        <div className="md:hidden mb-6">
          <SwipeableCards>
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-5 rounded-2xl shadow-sm text-white h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <TrendingUp size={22} />
                </div>
                <span className="text-xs font-medium bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">Today</span>
              </div>
              <h3 className="text-green-100 text-sm font-medium mb-1">Today's Collection</h3>
              <p className="text-3xl font-bold">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl">
                  <AlertCircle size={22} />
                </div>
                <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">Outstanding</span>
              </div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Outstanding Fees</h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Users size={22} />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">Active</span>
              </div>
              <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Active Students</h3>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.activeStudents || '0'}</p>
            </div>
          </SwipeableCards>
        </div>

        {/* Recent Payments */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-white">Recent Payments</h2>
            <Link to="/finance" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">View All</Link>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
              <thead className="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium">
                <tr>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Class</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {(stats?.recentPayments?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No recent payments</td>
                  </tr>
                ) : (
                  stats?.recentPayments?.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {payment.student?.firstName} {payment.student?.lastName}
                      </td>
                      <td className="px-6 py-4">{payment.student?.class?.name || 'N/A'}</td>
                      <td className={`px-6 py-4 font-semibold ${payment.status === 'VOIDED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        ZMW {Number(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          ${payment.method === 'CASH' ? 'bg-green-100 text-green-700' :
                            payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'}`}>
                          {payment.method.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        {payment.status === 'VOIDED' ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Voided</span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile List */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
            {(stats?.recentPayments?.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No recent payments</div>
            ) : (
              stats?.recentPayments?.map((payment) => (
                <div key={payment.id} className="p-4 active:bg-gray-50 dark:active:bg-slate-700 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{payment.student?.firstName} {payment.student?.lastName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{payment.student?.class?.name || 'N/A'}</p>
                    </div>
                    <span className={`text-lg font-bold ${payment.status === 'VOIDED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                      ZMW {Number(payment.amount).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                        ${payment.method === 'CASH' ? 'bg-green-100 text-green-700' :
                          payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'}`}>
                        {payment.method.replace('_', ' ')}
                      </span>
                      {payment.status === 'VOIDED' && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium">Voided</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
};

export default Dashboard;
