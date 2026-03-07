import { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, Users, DollarSign, GraduationCap,
  AlertTriangle, CheckCircle, Activity, RefreshCw, BookOpen
} from 'lucide-react';
import analyticsService, { AnalyticsDashboard, SchoolHealth } from '../../services/analyticsService';
import toast from 'react-hot-toast';

const Analytics = () => {
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [health, setHealth] = useState<SchoolHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'attendance' | 'health'>('overview');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashData, healthData] = await Promise.all([
        analyticsService.getDashboard(),
        analyticsService.getSchoolHealth(),
      ]);
      setDashboard(dashData);
      setHealth(healthData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(amount);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics & Insights</h1>
          <p className="text-gray-500 dark:text-gray-400">Comprehensive school performance overview</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
        {(['overview', 'revenue', 'attendance', 'health'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && dashboard && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{dashboard.enrollment.total}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Students</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(dashboard.revenue.totalRevenue)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Revenue ({dashboard.revenue.transactionCount} payments)</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <GraduationCap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <span className={`text-xs font-medium ${getScoreColor(dashboard.academic.passRate)}`}>
                  {dashboard.academic.passRate}% pass rate
                </span>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{dashboard.academic.averageScore}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Average Score</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <span className={`text-xs font-medium ${dashboard.attendance.rate >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {dashboard.attendance.rate}%
                </span>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{dashboard.attendance.rate}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Attendance Rate</p>
            </div>
          </div>

          {/* Enrollment by Grade & Subject Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Enrollment by Class</h3>
              <div className="space-y-3">
                {dashboard.enrollment.byGrade.map(item => {
                  const maxStudents = Math.max(...dashboard.enrollment.byGrade.map(g => g.students)) || 1;
                  return (
                    <div key={item.className} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 dark:text-gray-400 w-24 truncate">{item.className}</span>
                      <div className="flex-1 h-6 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${(item.students / maxStudents) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">
                        {item.students}
                      </span>
                    </div>
                  );
                })}
                {dashboard.enrollment.byGrade.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No enrollment data</p>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subject Performance</h3>
              <div className="space-y-3">
                {dashboard.academic.subjectPerformance.map((sub, i) => (
                  <div key={sub.subject} className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : sub.average >= 60 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{sub.subject}</p>
                      <div className="w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full mt-1">
                        <div
                          className={`h-full rounded-full ${sub.average >= 60 ? 'bg-green-500' : sub.average >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${sub.average}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${getScoreColor(sub.average)}`}>
                      {sub.average}%
                    </span>
                  </div>
                ))}
                {dashboard.academic.subjectPerformance.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No assessment data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Risk Summary */}
          {dashboard.risk.total > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Student Risk Overview ({dashboard.risk.total} flagged)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {dashboard.risk.byLevel.map(r => (
                  <div key={r.level} className={`p-4 rounded-xl text-center ${
                    r.level === 'CRITICAL' ? 'bg-red-50 dark:bg-red-900/20' :
                    r.level === 'HIGH' ? 'bg-orange-50 dark:bg-orange-900/20' :
                    r.level === 'MEDIUM' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                    'bg-green-50 dark:bg-green-900/20'
                  }`}>
                    <p className={`text-2xl font-bold ${
                      r.level === 'CRITICAL' ? 'text-red-600' :
                      r.level === 'HIGH' ? 'text-orange-600' :
                      r.level === 'MEDIUM' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>{r.count}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{r.level.toLowerCase()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(dashboard.revenue.totalRevenue)}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Transactions</p>
              <p className="text-2xl font-bold text-blue-600">{dashboard.revenue.transactionCount}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Collection Rate</p>
              <p className="text-2xl font-bold text-blue-600">{health?.metrics.feeCollectionRate || 0}%</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Revenue Trend</h3>
            <div className="space-y-2">
              {dashboard.revenue.weeklyTrend.map(item => {
                const max = Math.max(...dashboard.revenue.weeklyTrend.map(r => r.amount)) || 1;
                return (
                  <div key={item.week} className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400 w-24">{item.week}</span>
                    <div className="flex-1 h-8 bg-gray-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-lg flex items-center px-2"
                        style={{ width: `${Math.max((item.amount / max) * 100, 5)}%` }}
                      >
                        <span className="text-xs text-white font-medium truncate">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dashboard.revenue.weeklyTrend.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No revenue data for this period</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && dashboard && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${
                dashboard.attendance.rate >= 85 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {dashboard.attendance.rate}%
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Overall Attendance Rate</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {dashboard.attendance.rate >= 85 ? 'School is performing well' : 'Needs improvement'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <p className="text-xl font-bold text-green-600">{dashboard.attendance.present}</p>
                <p className="text-xs text-gray-500">Present</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p className="text-xl font-bold text-yellow-600">{dashboard.attendance.late}</p>
                <p className="text-xs text-gray-500">Late</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <p className="text-xl font-bold text-red-600">{dashboard.attendance.absent}</p>
                <p className="text-xs text-gray-500">Absent</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* School Health Tab */}
      {activeTab === 'health' && health && (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">Students</h4>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{health.metrics.activeStudents}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">Teachers</h4>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{health.metrics.activeTeachers}</p>
              <p className="text-xs text-gray-400">Ratio: {health.metrics.studentTeacherRatio}:1</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">Fee Collection</h4>
              </div>
              <p className={`text-2xl font-bold ${getScoreColor(health.metrics.feeCollectionRate)}`}>{health.metrics.feeCollectionRate}%</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-orange-600" />
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">Attendance</h4>
              </div>
              <p className={`text-2xl font-bold ${getScoreColor(health.metrics.weeklyAttendanceRate)}`}>{health.metrics.weeklyAttendanceRate}%</p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <BookOpen className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{health.metrics.totalClasses}</p>
              <p className="text-sm text-gray-500">Total Classes</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <AlertTriangle className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{health.metrics.atRiskStudents}</p>
              <p className="text-sm text-gray-500">At-Risk Students</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{health.metrics.currentTerm}</p>
              <p className="text-sm text-gray-500">Current Term</p>
            </div>
          </div>

          {/* AI Insights */}
          {health.insights.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Key Insights
              </h3>
              <ul className="space-y-3">
                {health.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Analytics;
