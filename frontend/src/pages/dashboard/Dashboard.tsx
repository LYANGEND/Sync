import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, AlertCircle, Brain, Shield, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PullToRefresh, DashboardSkeleton, SwipeableCards } from '../../components/mobile';
import analyticsService, { type AnalyticsDashboard } from '../../services/analyticsService';

import TeacherDashboard from './TeacherDashboard';
import DashboardAnalytics, { type AnalyticsPeriod } from './DashboardAnalytics';

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
  const canViewAnalytics = ['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER'].includes(user?.role ?? '');
  const [data, setData] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>(90);
  const [analyticsDataPeriod, setAnalyticsDataPeriod] = useState<AnalyticsPeriod>(90);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get<DashboardData>('/dashboard/stats');
      setData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (!canViewAnalytics) {
      setAnalytics(null);
      setAnalyticsLoading(false);
      return;
    }

    setAnalyticsLoading(true);
    setAnalyticsUnavailable(false);
    try {
      setAnalytics(await analyticsService.getDashboard(analyticsPeriod));
      setAnalyticsDataPeriod(analyticsPeriod);
    } catch (error) {
      console.error('Error fetching dashboard analytics:', error);
      setAnalyticsUnavailable(true);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsPeriod, canViewAnalytics]);

  useEffect(() => {
    if (user?.role === 'PARENT' || user?.role === 'PLATFORM_ADMIN') return;

    void fetchStats();
  }, [user?.role, fetchStats]);

  useEffect(() => {
    if (user?.role === 'PARENT' || user?.role === 'PLATFORM_ADMIN') return;

    void fetchAnalytics();
  }, [user?.role, fetchAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([fetchStats(), fetchAnalytics()]);
    } finally {
      setRefreshing(false);
    }
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
          <div className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_8px_32px_-18px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="grid size-9 place-items-center rounded-[10px] bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <TrendingUp size={20} aria-hidden="true" />
              </div>
              <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">Today</span>
            </div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Today's Collection</h3>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums text-gray-900 dark:text-white">ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
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

        {/* School Analytics */}
        {canViewAnalytics && (
          <DashboardAnalytics
            analytics={analytics}
            loading={analyticsLoading}
            unavailable={analyticsUnavailable}
            periodDays={analyticsPeriod}
            dataPeriodDays={analyticsDataPeriod}
            onPeriodChange={setAnalyticsPeriod}
            onRetry={fetchAnalytics}
          />
        )}

      </div>
    </PullToRefresh>
  );
};

export default Dashboard;
