import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Users, AlertCircle, BookOpen, CheckSquare, Brain, Shield, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PullToRefresh, DashboardSkeleton, SwipeableCards } from '../../components/mobile';
import styles from './Dashboard.module.css';

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

// Static class map for Quick Action icon tinting - Tailwind cannot generate
// classes from runtime template literals (e.g. `bg-${color}-100`), so each
// variant must be spelled out literally to survive production purging. Card
// chrome (border/shadow/hover) lives in Dashboard.module.css.
const quickActionStyles: Record<string, { iconBg: string; iconText: string }> = {
  blue: { iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconText: 'text-blue-600 dark:text-blue-400' },
  green: { iconBg: 'bg-green-100 dark:bg-green-900/30', iconText: 'text-green-600 dark:text-green-400' },
  purple: { iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconText: 'text-purple-600 dark:text-purple-400' },
  orange: { iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconText: 'text-orange-600 dark:text-orange-400' },
};

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
      <div className={`p-4 md:p-6 ${styles.page}`}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Welcome back, here's what's happening today.</p>
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          {[
            { icon: Users, label: 'Students', path: '/students', color: 'blue' },
            { icon: TrendingUp, label: 'Finance', path: '/finance', color: 'green' },
            { icon: BookOpen, label: 'Classes', path: '/classes', color: 'purple' },
            { icon: CheckSquare, label: 'Attendance', path: '/attendance', color: 'orange' },
          ].map((action) => (
            <Link key={action.label} to={action.path} className={styles.actionCard}>
              <div className={`${styles.actionIcon} ${quickActionStyles[action.color].iconBg} ${quickActionStyles[action.color].iconText}`}>
                <action.icon size={20} aria-hidden="true" />
              </div>
              <span className={styles.actionLabel}>{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Intelligence Summary */}
        {stats?.intelligence && (stats.intelligence.atRiskCount > 0 || stats.intelligence.unresolvedAlerts > 0) && (
          <div className={styles.alertGrid}>
            <Link
              to="/intelligence"
              className={`${styles.alertCard} bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800`}
            >
              <div className={`${styles.alertIcon} bg-orange-100 dark:bg-orange-900/40`}>
                <Shield size={20} className="text-orange-600 dark:text-orange-400" aria-hidden="true" />
              </div>
              <div>
                <p className={`${styles.alertValue} text-orange-700 dark:text-orange-400`}>{stats.intelligence.atRiskCount}</p>
                <p className={`${styles.alertLabel} text-orange-600 dark:text-orange-400`}>At-Risk Students</p>
              </div>
            </Link>
            <Link
              to="/intelligence"
              className={`${styles.alertCard} bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800`}
            >
              <div className={`${styles.alertIcon} bg-red-100 dark:bg-red-900/40`}>
                <Bell size={20} className="text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <div>
                <p className={`${styles.alertValue} text-red-700 dark:text-red-400`}>{stats.intelligence.unresolvedAlerts}</p>
                <p className={`${styles.alertLabel} text-red-600 dark:text-red-400`}>Attendance Alerts</p>
              </div>
            </Link>
            <div className={`${styles.alertCard} bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800`}>
              <div className={`${styles.alertIcon} bg-blue-100 dark:bg-blue-900/40`}>
                <Brain size={20} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div>
                <p className={`${styles.alertValue} text-blue-700 dark:text-blue-400`}>{stats.intelligence.attendanceRate}%</p>
                <p className={`${styles.alertLabel} text-blue-600 dark:text-blue-400`}>Weekly Attendance</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid - Desktop */}
        <div className={`hidden md:grid md:grid-cols-3 gap-4 ${styles.statGrid}`}>
          <div className={`${styles.statCard} ${styles.statCardHighlight}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <TrendingUp size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">Today</span>
            </div>
            <h3 className={styles.statLabel}>Today's Collection</h3>
            <p className={styles.statValue}>ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
          </div>

          <div className={`${styles.statCard} ${styles.statCardNeutral}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`${styles.statIconWrap} bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400`}>
                <AlertCircle size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">Outstanding</span>
            </div>
            <h3 className={`${styles.statLabel} text-secondary`} style={{ color: 'var(--text-secondary)' }}>Outstanding Fees</h3>
            <p className={styles.statValue} style={{ color: 'var(--text-primary)' }}>ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
          </div>

          <div className={`${styles.statCard} ${styles.statCardNeutral}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`${styles.statIconWrap} bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400`}>
                <Users size={20} aria-hidden="true" />
              </div>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">Active</span>
            </div>
            <h3 className={styles.statLabel} style={{ color: 'var(--text-secondary)' }}>Active Students</h3>
            <p className={styles.statValue} style={{ color: 'var(--text-primary)' }}>{stats?.activeStudents || '0'}</p>
          </div>
        </div>

        {/* Stats Cards - Mobile (Swipeable) */}
        <div className="md:hidden">
          <SwipeableCards>
            <div className={`${styles.statCard} ${styles.statCardHighlight} h-full`}>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                  <TrendingUp size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm">Today</span>
              </div>
              <h3 className={styles.statLabel}>Today's Collection</h3>
              <p className={styles.statValue}>ZMW {stats?.dailyRevenue.toLocaleString() || '0'}</p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardNeutral} h-full`}>
              <div className="flex items-center justify-between mb-4">
                <div className={`${styles.statIconWrap} bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400`}>
                  <AlertCircle size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">Outstanding</span>
              </div>
              <h3 className={styles.statLabel} style={{ color: 'var(--text-secondary)' }}>Outstanding Fees</h3>
              <p className={styles.statValue} style={{ color: 'var(--text-primary)' }}>ZMW {stats?.outstandingFees.toLocaleString() || '0'}</p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardNeutral} h-full`}>
              <div className="flex items-center justify-between mb-4">
                <div className={`${styles.statIconWrap} bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400`}>
                  <Users size={22} aria-hidden="true" />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">Active</span>
              </div>
              <h3 className={styles.statLabel} style={{ color: 'var(--text-secondary)' }}>Active Students</h3>
              <p className={styles.statValue} style={{ color: 'var(--text-primary)' }}>{stats?.activeStudents || '0'}</p>
            </div>
          </SwipeableCards>
        </div>

        {/* Recent Payments */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Payments</h2>
            <Link to="/finance" className={styles.viewAll}>View All</Link>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentPayments?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center" style={{ color: 'var(--text-secondary)', padding: '32px 24px' }}>No recent payments</td>
                  </tr>
                ) : (
                  stats?.recentPayments?.map((payment) => (
                    <tr key={payment.id}>
                      <td className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {payment.student?.firstName} {payment.student?.lastName}
                      </td>
                      <td>{payment.student?.class?.name || 'N/A'}</td>
                      <td className={`font-semibold ${payment.status === 'VOIDED' ? 'line-through text-gray-400 dark:text-gray-500' : ''}`} style={payment.status !== 'VOIDED' ? { color: 'var(--text-primary)' } : undefined}>
                        ZMW {Number(payment.amount).toLocaleString()}
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          ${payment.method === 'CASH' ? 'bg-green-100 text-green-700' :
                            payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'}`}>
                          {payment.method.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
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
          <div className="md:hidden">
            {(stats?.recentPayments?.length ?? 0) === 0 ? (
              <div className="text-center text-sm" style={{ color: 'var(--text-secondary)', padding: '32px' }}>No recent payments</div>
            ) : (
              stats?.recentPayments?.map((payment) => (
                <div key={payment.id} className={styles.mobileRow}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{payment.student?.firstName} {payment.student?.lastName}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{payment.student?.class?.name || 'N/A'}</p>
                    </div>
                    <span className={`text-lg font-bold ${payment.status === 'VOIDED' ? 'line-through text-gray-400 dark:text-gray-500' : ''}`} style={payment.status !== 'VOIDED' ? { color: 'var(--text-primary)' } : undefined}>
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
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
