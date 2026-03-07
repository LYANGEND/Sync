import { useState, useEffect } from 'react';
import {
  AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw, Eye, Bell, BookOpen,
  TrendingDown, DollarSign, Calendar, Brain, Loader2
} from 'lucide-react';
import api from '../../utils/api';
import intelligenceService, { RiskAssessment, AttendanceAlert } from '../../services/intelligenceService';
import toast from 'react-hot-toast';

const StudentIntelligence = () => {
  const [activeTab, setActiveTab] = useState<'risk' | 'alerts' | 'fees'>('risk');
  const [atRiskStudents, setAtRiskStudents] = useState<RiskAssessment[]>([]);
  const [alerts, setAlerts] = useState<AttendanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<RiskAssessment | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch active term first, then use its ID for risk queries
      let termId: string | undefined;
      try {
        const termRes = await api.get('/terms/active');
        termId = termRes.data?.id;
      } catch { /* no active term */ }

      const [riskData, alertsData] = await Promise.all([
        intelligenceService.getAtRiskStudents({ termId, minLevel: 'MEDIUM' }).catch(() => []),
        intelligenceService.getAttendanceAlerts({ resolved: false }).catch(() => []),
      ]);
      setAtRiskStudents(riskData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error fetching intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async (studentId: string) => {
    setLoadingRecs(true);
    try {
      const data = await intelligenceService.getAIRecommendations(studentId, '');
      setRecommendations(data.recommendations || []);
    } catch {
      toast.error('Could not load recommendations');
      setRecommendations([]);
    } finally {
      setLoadingRecs(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    try {
      await intelligenceService.resolveAlert(alertId, 'Resolved from dashboard');
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success('Alert resolved');
    } catch {
      toast.error('Failed to resolve');
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <ShieldX className="w-3 h-3" /> Critical
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            <ShieldAlert className="w-3 h-3" /> High
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Shield className="w-3 h-3" /> Medium
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <ShieldCheck className="w-3 h-3" /> Low
          </span>
        );
    }
  };

  const filteredStudents = riskFilter === 'ALL'
    ? atRiskStudents
    : atRiskStudents.filter(s => s.riskLevel === riskFilter);

  const riskCounts = {
    CRITICAL: atRiskStudents.filter(s => s.riskLevel === 'CRITICAL').length,
    HIGH: atRiskStudents.filter(s => s.riskLevel === 'HIGH').length,
    MEDIUM: atRiskStudents.filter(s => s.riskLevel === 'MEDIUM').length,
    LOW: atRiskStudents.filter(s => s.riskLevel === 'LOW').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-600" />
            Student Intelligence
          </h1>
          <p className="text-gray-500 dark:text-gray-400">AI-powered risk detection & attendance insights</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Analysis
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 rounded-xl p-1">
        {[
          { key: 'risk', label: 'At-Risk Students', icon: AlertTriangle },
          { key: 'alerts', label: `Attendance Alerts (${alerts.length})`, icon: Bell },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'risk' | 'alerts')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Risk Tab */}
      {activeTab === 'risk' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Critical', count: riskCounts.CRITICAL, color: 'red', filter: 'CRITICAL' },
              { label: 'High', count: riskCounts.HIGH, color: 'orange', filter: 'HIGH' },
              { label: 'Medium', count: riskCounts.MEDIUM, color: 'yellow', filter: 'MEDIUM' },
              { label: 'Low', count: riskCounts.LOW, color: 'green', filter: 'LOW' },
            ].map(card => (
              <button
                key={card.label}
                onClick={() => setRiskFilter(riskFilter === card.filter ? 'ALL' : card.filter)}
                className={`p-4 rounded-xl border transition-all ${
                  riskFilter === card.filter
                    ? `border-${card.color}-500 bg-${card.color}-50 dark:bg-${card.color}-900/20 ring-2 ring-${card.color}-500/30`
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md'
                }`}
              >
                <p className={`text-3xl font-bold text-${card.color}-600`}>{card.count}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label} Risk</p>
              </button>
            ))}
          </div>

          {/* Student List */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Class</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Risk Level</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Score</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Key Factors</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {filteredStudents.map(student => (
                    <tr key={student.studentId} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{student.studentName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400">{student.className}</p>
                      </td>
                      <td className="px-4 py-3">{getRiskBadge(student.riskLevel)}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{student.riskScore}/100</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex gap-2">
                          {student.factors.academic > 15 && (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                              <BookOpen className="w-3 h-3" /> Academic
                            </span>
                          )}
                          {student.factors.attendance > 10 && (
                            <span className="inline-flex items-center gap-1 text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">
                              <Calendar className="w-3 h-3" /> Attendance
                            </span>
                          )}
                          {student.factors.financial > 8 && (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                              <DollarSign className="w-3 h-3" /> Financial
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setSelectedStudent(student);
                            fetchRecommendations(student.studentId);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <ShieldCheck className="w-12 h-12 text-green-400 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">
                          {riskFilter === 'ALL' ? 'No at-risk students detected' : `No ${riskFilter.toLowerCase()} risk students`}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-12 border border-gray-200 dark:border-slate-700 text-center">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No active attendance alerts</p>
              <p className="text-sm text-gray-400 mt-1">Run analysis to detect attendance patterns</p>
              <button
                onClick={async () => {
                  try {
                    await api.post('/intelligence/attendance/analyze');
                    toast.success('Analysis running...');
                    fetchData();
                  } catch {
                    toast.error('Failed to run analysis');
                  }
                }}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
              >
                Run Attendance Analysis
              </button>
            </div>
          )}

          {alerts.map(alert => (
            <div
              key={alert.id}
              className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 flex items-start gap-4"
            >
              <div className={`p-2 rounded-lg flex-shrink-0 ${
                alert.alertType === 'CHRONIC' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${
                  alert.alertType === 'CHRONIC' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {alert.student ? `${alert.student.firstName} ${alert.student.lastName}` : 'Student'}
                  {alert.student?.class && (
                    <span className="text-gray-400 font-normal ml-2">({alert.student.class.name})</span>
                  )}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(alert.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => resolveAlert(alert.id)}
                className="text-xs px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors flex-shrink-0"
              >
                Resolve
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStudent(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedStudent.studentName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedStudent.className}</p>
              </div>
              {getRiskBadge(selectedStudent.riskLevel)}
            </div>

            {/* Risk Score Breakdown */}
            <div className="space-y-3 mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase">Risk Factor Breakdown</h4>
              {[
                { label: 'Academic', score: selectedStudent.factors.academic, max: 40, icon: BookOpen, color: 'blue' },
                { label: 'Attendance', score: selectedStudent.factors.attendance, max: 30, icon: Calendar, color: 'purple' },
                { label: 'Financial', score: selectedStudent.factors.financial, max: 20, icon: DollarSign, color: 'green' },
                { label: 'Trend', score: selectedStudent.factors.trend, max: 10, icon: TrendingDown, color: 'orange' },
              ].map(factor => (
                <div key={factor.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <factor.icon className="w-4 h-4" />
                      {factor.label}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">{factor.score}/{factor.max}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full">
                    <div
                      className={`h-full rounded-full bg-${factor.color}-500`}
                      style={{ width: `${(factor.score / factor.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Details */}
            <div className="space-y-2 mb-6 text-sm">
              <h4 className="font-semibold text-gray-700 dark:text-gray-300 uppercase">Details</h4>
              {selectedStudent.details.averageScore !== undefined && (
                <p className="text-gray-600 dark:text-gray-400">Average Score: <span className="font-medium text-gray-900 dark:text-white">{selectedStudent.details.averageScore.toFixed(1)}%</span></p>
              )}
              {selectedStudent.details.attendanceRate !== undefined && (
                <p className="text-gray-600 dark:text-gray-400">Attendance Rate: <span className="font-medium text-gray-900 dark:text-white">{selectedStudent.details.attendanceRate.toFixed(1)}%</span></p>
              )}
              {selectedStudent.details.failingSubjects && selectedStudent.details.failingSubjects.length > 0 && (
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Failing Subjects:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedStudent.details.failingSubjects.map(s => (
                      <span key={s} className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Recommendations */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600" />
                AI Recommendations
              </h4>
              {loadingRecs ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading recommendations...
                </div>
              ) : recommendations.length > 0 ? (
                <ul className="space-y-2">
                  {recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {rec}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No AI recommendations available. Enable AI in settings.</p>
              )}
            </div>

            <button
              onClick={() => setSelectedStudent(null)}
              className="w-full py-2.5 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentIntelligence;
