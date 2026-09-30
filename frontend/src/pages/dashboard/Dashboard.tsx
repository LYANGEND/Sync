import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, AlertCircle, Brain, Shield, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PullToRefresh, DashboardSkeleton, SwipeableCards } from '../../components/mobile';

import TeacherDashboard from './TeacherDashboard';

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

  if (user?.role === 'PLATFORM_ADMIN') {
    return <Navigate to="/ops/tenants" replace />;
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  // --- TEACHER VIEW ---
  if (data?.role === 'TEACHER') {
    return <TeacherDashboard data={data as TeacherStats} user={user} onRefresh={handleRefresh} />;
  }

  // --- ADMIN / BURSAR VIEW ---
  const stats = data as AdminStats;

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen">
      <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy={refreshing}>
        <span className="sr-only" role="status" aria-live="polite">
          {refreshing ? 'Refreshing dashboard data.' : ''}
        </span>

        {/* Intelligence Summary */}
        {stats?.intelligence && (stats.intelligence.atRiskCount > 0 || stats.intelligence.unresolvedAlerts > 0) && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Link
              to="/intelligence"
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[20px] border border-orange-200 bg-orange-50 p-4 transition-shadow duration-200 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:border-orange-800 dark:bg-orange-900/20 dark:focus-visible:ring-offset-slate-900"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-orange-100 dark:bg-orange-900/40">
                <Shield size={20} className="text-orange-600 dark:text-orange-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight text-orange-700 dark:text-orange-400">{stats.intelligence.atRiskCount}</p>
                <p className="text-xs text-orange-700 dark:text-orange-300">At-Risk Students</p>
              </div>
            </Link>
            <Link
              to="/intelligence"
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[20px] border border-red-200 bg-red-50 p-4 transition-shadow duration-200 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:border-red-800 dark:bg-red-900/20 dark:focus-visible:ring-offset-slate-900"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-red-100 dark:bg-red-900/40">
                <Bell size={20} className="text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight text-red-700 dark:text-red-400">{stats.intelligence.unresolvedAlerts}</p>
                <p className="text-xs text-red-700 dark:text-red-300">Attendance Alerts</p>
              </div>
            </Link>
            <div className="flex min-h-11 items-center gap-3 rounded-[20px] border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-blue-100 dark:bg-blue-900/40">
                <Brain size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight text-blue-700 dark:text-blue-400">{stats.intelligence.attendanceRate}%</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Weekly Attendance</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid - Desktop */}
        <div className="hidden gap-4 md:grid md:grid-cols-3">
          <div className="rounded-[20px] bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <TrendingUp size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">Today</span>
            </div>
            <h3 className="text-sm font-medium text-green-50">Today's Collection</h3>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
          </div>

          <div className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="grid size-9 place-items-center rounded-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                <AlertCircle size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">Outstanding</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Outstanding Fees</h3>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums text-gray-900 dark:text-white">ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
          </div>

          <div className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="grid size-9 place-items-center rounded-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Users size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">Active</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Active Students</h3>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums text-gray-900 dark:text-white">{stats?.activeStudents || '0'}</p>
          </div>
        </div>

        {/* Stats Cards - Mobile (Swipeable) */}
        <div className="md:hidden">
          <SwipeableCards>
            <div className="h-full rounded-[20px] bg-gradient-to-br from-green-500 to-green-600 p-6 text-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)]">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <TrendingUp size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">Today</span>
              </div>
              <h3 className="text-sm font-medium text-green-50">Today's Collection</h3>
              <p className="mt-0.5 text-[28px] font-bold tabular-nums">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
            </div>

            <div className="h-full rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div className="grid size-9 place-items-center rounded-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <AlertCircle size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">Outstanding</span>
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Outstanding Fees</h3>
              <p className="mt-0.5 text-[28px] font-bold tabular-nums text-gray-900 dark:text-white">ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
            </div>

            <div className="h-full rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div className="grid size-9 place-items-center rounded-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Users size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">Active</span>
              </div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Active Students</h3>
              <p className="mt-0.5 text-[28px] font-bold tabular-nums text-gray-900 dark:text-white">{stats?.activeStudents || '0'}</p>
            </div>
          </SwipeableCards>
        </div>

        {/* Recent Payments */}
        <section className="overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_8px_32px_-18px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-800" aria-labelledby="recent-payments-title">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 md:px-6 dark:border-slate-700">
            <h2 id="recent-payments-title" className="text-base font-semibold text-gray-900 dark:text-white">Recent Payments</h2>
            <Link
              to="/finance"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-sm font-semibold text-primary transition-opacity duration-150 hover:opacity-75 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none dark:focus-visible:ring-offset-slate-800"
            >
              View All
            </Link>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300" aria-label="Recent payments">
              <thead className="bg-gray-50 font-semibold text-gray-800 dark:bg-slate-700 dark:text-gray-100">
                <tr>
                  <th scope="col" className="px-6 py-3">Student</th>
                  <th scope="col" className="px-6 py-3">Class</th>
                  <th scope="col" className="px-6 py-3 text-right">Amount</th>
                  <th scope="col" className="px-6 py-3">Method</th>
                  <th scope="col" className="px-6 py-3">Time</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {(stats?.recentPayments?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-600 dark:text-gray-300">No recent payments</td>
                  </tr>
                ) : (
                  stats?.recentPayments?.map((payment) => (
                    <tr key={payment.id} className="transition-colors duration-150 hover:bg-gray-50 motion-reduce:transition-none dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {payment.student?.firstName} {payment.student?.lastName}
                      </td>
                      <td className="px-6 py-4">{payment.student?.class?.name || 'N/A'}</td>
                      <td className={`px-6 py-4 text-right font-semibold tabular-nums ${payment.status === 'VOIDED' ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                        ZMW {Number(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          ${payment.method === 'CASH' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                          {payment.method.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        {payment.status === 'VOIDED' ? (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Voided</span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile List */}
          <div className="md:hidden">
            {(stats?.recentPayments?.length ?? 0) === 0 ? (
              <div className="p-8 text-center text-sm text-gray-600 dark:text-gray-300">No recent payments</div>
            ) : (
              stats?.recentPayments?.map((payment) => (
                <div key={payment.id} className="border-t border-gray-200 p-4 transition-colors duration-150 active:bg-gray-50 motion-reduce:transition-none dark:border-slate-700 dark:active:bg-slate-700/50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">{payment.student?.firstName} {payment.student?.lastName}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{payment.student?.class?.name || 'N/A'}</p>
                    </div>
                    <span className={`shrink-0 text-right text-lg font-bold tabular-nums ${payment.status === 'VOIDED' ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                      ZMW {Number(payment.amount).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                        ${payment.method === 'CASH' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                          payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                        {payment.method.replace('_', ' ')}
                      </span>
                      {payment.status === 'VOIDED' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Voided</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PullToRefresh>
  );
};

export default Dashboard;
