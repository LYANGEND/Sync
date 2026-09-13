import { useState, useEffect, useCallback } from 'react';
import { Users, AlertCircle, BookOpen, Wallet, ChevronRight, GraduationCap, Banknote, CalendarCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import { PullToRefresh, DashboardSkeleton } from '../../components/mobile';
import { Alert, Avatar, Badge, Button, EmptyState, PageHeader, StatCard, TableContainer } from '../../components/ui/DesignSystem';
import TeacherDashboard from './TeacherDashboard';

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
  const { settings } = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    setError(false);
    try {
      const response = await api.get('/dashboard/stats');
      setData(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && !['PARENT', 'PLATFORM_ADMIN'].includes(user.role)) void fetchStats();
  }, [user, fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchStats(); } finally { setRefreshing(false); }
  };

  if (user?.role === 'PARENT') return <Navigate to="/my-children" replace />;
  if (user?.role === 'PLATFORM_ADMIN') return <Navigate to="/ops/tenants" replace />;
  if (loading) return <DashboardSkeleton />;
  if (data?.role === 'TEACHER') return <TeacherDashboard data={data} user={user} onRefresh={handleRefresh} />;

  const stats = data?.role === 'ADMIN' ? data : null;
  const money = (value: number) => `ZMW ${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payments = stats?.recentPayments ?? [];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const shortcuts = [
    { icon: Users, label: 'Students', path: '/students' },
    { icon: Wallet, label: 'Finance', path: '/finance' },
    { icon: BookOpen, label: 'Academics', path: '/academics' },
    { icon: CalendarCheck, label: 'Attendance', path: '/academics/attendance' },
  ];
  const paymentMethod = (method: string) => method === 'MOBILE_MONEY' ? 'Mobile money' : method === 'CASH' ? 'Cash' : method === 'BANK_DEPOSIT' ? 'Bank deposit' : method.replace(/_/g, ' ');

  return <PullToRefresh onRefresh={handleRefresh}>
    <div className="ds-page">
      <PageHeader
        title={`${greeting}, ${user?.fullName?.split(' ')[0] || 'Admin'}`}
        description={`${settings.schoolName} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            {!refreshing && <RefreshCw size={16} aria-hidden="true" />}
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert tone="error">
          Unable to load the dashboard. {stats ? 'Previously loaded figures are shown. ' : ''}Select Refresh to try again.
        </Alert>
      )}

      {stats && (
        <>
          <section aria-label="School overview" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Today's collection" value={money(stats.dailyRevenue)} icon={Banknote} detail="Payments received today" />
            <StatCard label="Outstanding fees" value={money(stats.outstandingFees)} icon={AlertCircle} tone="warning" detail="Total balance to collect" />
            <StatCard label="Active students" value={stats.activeStudents.toLocaleString()} icon={GraduationCap} detail="Currently enrolled" />
          </section>

          <section className="ds-section" aria-labelledby="quick-actions-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="quick-actions-title" className="text-base font-semibold text-[var(--text-primary)]">Quick actions</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
              {shortcuts.map(({ icon: Icon, label, path }) => (
                <Link key={path} to={path} className="ds-shortcut">
                  <span className="ds-shortcut-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="min-w-0 break-words">{label}</span>
                  <ChevronRight size={16} aria-hidden="true" className="ml-auto shrink-0 text-[var(--text-tertiary)]" />
                </Link>
              ))}
            </div>
          </section>

          {stats.intelligence && (stats.intelligence.atRiskCount > 0 || stats.intelligence.unresolvedAlerts > 0) && (
            <Alert tone="warning" className="items-center">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p>
                  <strong>{stats.intelligence.atRiskCount}</strong> at-risk students, <strong>{stats.intelligence.unresolvedAlerts}</strong> attendance alerts, and <strong>{stats.intelligence.attendanceRate}%</strong> weekly attendance.
                </p>
                <Link to="/ai-intelligence" className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4">
                  Review alerts
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </Alert>
          )}

          <section className="ds-surface overflow-hidden" aria-labelledby="recent-payments-title">
            <div className="ds-card-header">
              <div>
                <h2 id="recent-payments-title" className="text-base font-semibold text-[var(--text-primary)]">Recent payments</h2>
                <p className="ds-helper mt-1">Your latest recorded transactions</p>
              </div>
              <Link to="/finance" className="ds-button-outline">
                View all
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </div>

            {payments.length === 0 ? (
              <EmptyState title="No payments yet" description="Recorded payments will appear here." />
            ) : (
              <>
                <TableContainer label="Recent payments" className="hidden rounded-none border-0 md:block">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th scope="col">Student</th>
                        <th scope="col">Class</th>
                        <th scope="col" className="text-right">Amount</th>
                        <th scope="col">Method</th>
                        <th scope="col">Time</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(payment => (
                        <tr key={payment.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <Avatar name={`${payment.student?.firstName || ''} ${payment.student?.lastName || ''}`} />
                              <span className="font-semibold">{payment.student?.firstName} {payment.student?.lastName}</span>
                            </div>
                          </td>
                          <td className="text-[var(--text-secondary)]">{payment.student?.class?.name || 'Unassigned'}</td>
                          <td className={`text-right font-semibold whitespace-nowrap ${payment.status === 'VOIDED' ? 'line-through text-[var(--text-secondary)]' : ''}`}>
                            {money(payment.amount)}
                          </td>
                          <td><Badge>{paymentMethod(payment.method)}</Badge></td>
                          <td className="whitespace-nowrap text-[var(--text-secondary)]">{new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td><Badge tone={payment.status === 'VOIDED' ? 'error' : 'success'}>{payment.status === 'VOIDED' ? 'Voided' : 'Completed'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableContainer>

                <ul className="divide-y divide-[var(--border-color)] md:hidden">
                  {payments.map(payment => (
                    <li key={payment.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold break-words">{payment.student?.firstName} {payment.student?.lastName}</p>
                          <p className="ds-helper mt-1">{payment.student?.class?.name || 'Unassigned'}</p>
                        </div>
                        <p className={`text-right font-semibold tabular-nums ${payment.status === 'VOIDED' ? 'line-through text-[var(--text-secondary)]' : ''}`}>
                          {money(payment.amount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={payment.status === 'VOIDED' ? 'error' : 'success'}>{payment.status === 'VOIDED' ? 'Voided' : 'Completed'}</Badge>
                        <span className="ds-helper text-xs">{paymentMethod(payment.method)} · {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  </PullToRefresh>;
};

export default Dashboard;
