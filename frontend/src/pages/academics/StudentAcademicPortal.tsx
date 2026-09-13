import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { PageHeader, Tabs, TabPanel } from '../../components/ui/DesignSystem';
import {
  BookOpen, TrendingUp, Award, Calendar, BarChart2,
  CheckCircle, Users
} from 'lucide-react';

interface DashboardData {
  student: any;
  activeTerm: any;
  currentGrades: any[];
  attendanceSummary: { present: number; absent: number; late: number; total: number; percentage: number };
  upcomingAssessments: any[];
  recentResults: any[];
  allTermResults: any[];
  position: number | null;
  totalStudents: number;
}

interface TrendData {
  trends: any[];
  subjects: string[];
}

const StudentAcademicPortal: React.FC = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'grades' | 'trends' | 'assessments'>('overview');

  // For parents with multiple children
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');

  // For teachers/admins: search students
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'PARENT') {
      fetchChildren();
    }
    // Teachers/admins pick a student from search
  }, [user]);

  useEffect(() => {
    if (selectedChild) {
      fetchDashboard(selectedChild);
      fetchTrends(selectedChild);
    }
  }, [selectedChild]);

  const fetchChildren = async () => {
    try {
      const res = await api.get('/students', { params: { parentId: user?.id } });
      const studentList = res.data?.students || res.data || [];
      setChildren(studentList);
      if (studentList.length > 0) {
        setSelectedChild(studentList[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
      setLoading(false);
    }
  };

  const searchStudents = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api.get('/students', { params: { search: query } });
      setSearchResults(res.data?.students || res.data || []);
    } catch (error) {
      console.error('Failed to search students:', error);
    }
  };

  const fetchDashboard = async (studentId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/student-portal/student/${studentId}/dashboard`);
      setDashboardData(res.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async (studentId: string) => {
    try {
      const res = await api.get(`/student-portal/student/${studentId}/trends`);
      setTrendData(res.data);
    } catch (error) {
      console.error('Failed to fetch trends:', error);
    }
  };

  if (loading && selectedChild) {
    return (
      <div className="ds-page flex items-center justify-center min-h-[400px]" role="status" aria-label="Loading pupil academic progress">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--action-color)]" aria-hidden="true"></div>
      </div>
    );
  }

  if (!dashboardData && !selectedChild) {
    // Teacher/admin needs to search for a student first
    return (
      <div className="ds-page">
        <PageHeader title="Pupil Academic Progress" description="Find a pupil to review grades, attendance and assessments." actions={
          <div className="relative w-full sm:w-64">
            <label htmlFor="portal-initial-search" className="ds-label mb-2">Search pupils</label>
            <input
              id="portal-initial-search"
              type="text"
              placeholder="Search pupil by name..."
              value={studentSearch}
              onChange={e => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
              className="ds-input"
            />
            {searchResults.length > 0 && studentSearch.length >= 2 && (
              <div className="ds-surface absolute right-0 mt-1 w-full sm:w-72 z-20 max-h-60 overflow-y-auto" role="region" aria-label="Pupil search results">
                {searchResults.slice(0, 10).map((s: any) => (
                  <button key={s.id} onClick={() => { setSelectedChild(s.id); setStudentSearch(`${s.firstName} ${s.lastName}`); setSearchResults([]); }}
                    className="ds-button-ghost w-full flex-col items-start text-left"
                  >
                    <span className="font-medium">{s.firstName} {s.lastName}</span>
                    <span className="ds-helper">{s.admissionNumber} • {s.class?.name || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        } />
        <div className="ds-card ds-empty">
          <Users className="w-12 h-12 mx-auto mb-4" aria-hidden="true" />
          <p>Search for a pupil to view their academic progress</p>
          <p className="ds-helper mt-2">Use the search box above to find a pupil by name</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="ds-page">
        <PageHeader title="Pupil Academic Progress" />
        <div className="ds-card ds-empty">
          <BookOpen className="w-12 h-12 mx-auto mb-3" aria-hidden="true" />
          <p>No academic data available for this pupil</p>
        </div>
      </div>
    );
  }

  const { student, activeTerm, currentGrades, attendanceSummary, upcomingAssessments, recentResults, position, totalStudents } = dashboardData;

  // Calculate overall average
  const overallAverage = currentGrades.length > 0
    ? Math.round(currentGrades.reduce((sum, g) => sum + Number(g.totalScore), 0) / currentGrades.length * 10) / 10
    : 0;

  const getGradeColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 dark:text-blue-400';
    if (score >= 40) return 'text-amber-700 dark:text-amber-300';
    return 'text-red-600 dark:text-red-400';
  };

  const getGradeBg = (score: number) => {
    if (score >= 80) return 'ds-badge-success';
    if (score >= 60) return 'ds-badge-info';
    if (score >= 40) return 'ds-badge-warning';
    return 'ds-badge-error';
  };

  const getGradeLetter = (score: number) => {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'E';
  };

  return (
    <div className="ds-page">
      {/* Header */}
      <PageHeader
        title={user?.role === 'PARENT' ? 'My Child\'s Academic Progress' : 'Pupil Academic Progress'}
        description={<>{student?.firstName} {student?.lastName} • {student?.class?.name}{activeTerm && ` • ${activeTerm.name}`}</>}
        actions={<>
        {/* Parent child selector */}
        {user?.role === 'PARENT' && children.length > 1 && (
          <label className="ds-field w-full sm:w-64">
          <span className="ds-label">Child</span>
          <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)}
            className="ds-select"
          >
            {children.map((c: any) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
          </label>
        )}

        {/* Teacher/Admin student search */}
        {(user?.role === 'TEACHER' || user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_MANAGER') && (
          <div className="relative w-full sm:w-64">
            <label htmlFor="portal-search" className="ds-label mb-2">Search pupils</label>
            <input
              id="portal-search"
              type="text"
              placeholder="Search pupil by name..."
              value={studentSearch}
              onChange={e => { setStudentSearch(e.target.value); searchStudents(e.target.value); }}
              className="ds-input"
            />
            {searchResults.length > 0 && studentSearch.length >= 2 && (
              <div className="ds-surface absolute right-0 mt-1 w-full sm:w-72 z-20 max-h-60 overflow-y-auto" role="region" aria-label="Pupil search results">
                {searchResults.slice(0, 10).map((s: any) => (
                  <button key={s.id} onClick={() => { setSelectedChild(s.id); setStudentSearch(`${s.firstName} ${s.lastName}`); setSearchResults([]); }}
                    className="ds-button-ghost w-full flex-col items-start text-left"
                  >
                    <span className="font-medium">{s.firstName} {s.lastName}</span>
                    <span className="ds-helper">{s.admissionNumber} • {s.class?.name || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </>}
      />

      {/* Tab Navigation */}
      <Tabs id="student-academics" label="Pupil academic progress" value={activeTab}
        onChange={value => setActiveTab(value as typeof activeTab)} items={[
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'grades', label: 'Grades', icon: Award },
          { id: 'trends', label: 'Trends', icon: TrendingUp },
          { id: 'assessments', label: 'Assessments', icon: Calendar },
        ].map(tab => ({ id: tab.id, label: <span className="flex items-center gap-2"><tab.icon className="w-4 h-4" aria-hidden="true" />{tab.label}</span> }))}
      />

      <TabPanel id="student-academics" value={activeTab}>
      {activeTab === 'overview' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="ds-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Average</span>
                <Award className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
              </div>
              <div className={`text-2xl font-bold ${getGradeColor(overallAverage)}`}>{overallAverage}%</div>
              <div className="text-xs text-gray-500 mt-1">Grade {getGradeLetter(overallAverage)}</div>
            </div>

            <div className="ds-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Position</span>
                <Users className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-white">
                {position ? `${position}` : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {position ? `of ${totalStudents} students` : 'Not ranked yet'}
              </div>
            </div>

            <div className="ds-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Attendance</span>
                <CheckCircle className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
              </div>
              <div className={`text-2xl font-bold ${attendanceSummary.percentage >= 90 ? 'text-green-700 dark:text-green-300' : attendanceSummary.percentage >= 75 ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}`}>
                {attendanceSummary.percentage}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {attendanceSummary.present + attendanceSummary.late}/{attendanceSummary.total} days
              </div>
            </div>

            <div className="ds-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subjects</span>
                <BookOpen className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-white">{currentGrades.length}</div>
              <div className="text-xs text-gray-500 mt-1">active subjects</div>
            </div>
          </div>

          {/* Attendance Breakdown */}
          <div className="ds-card mb-6">
            <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Attendance Breakdown</h3>
            <div className="flex gap-2 h-4 rounded-full overflow-hidden bg-[var(--surface-muted)]" aria-hidden="true">
              {attendanceSummary.total > 0 && (
                <>
                  <div className="bg-green-500 rounded-l-full" style={{ width: `${(attendanceSummary.present / attendanceSummary.total) * 100}%` }} />
                  <div className="bg-yellow-500" style={{ width: `${(attendanceSummary.late / attendanceSummary.total) * 100}%` }} />
                  <div className="bg-red-500 rounded-r-full" style={{ width: `${(attendanceSummary.absent / attendanceSummary.total) * 100}%` }} />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-[var(--text-secondary)]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Present ({attendanceSummary.present})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-full"></span> Late ({attendanceSummary.late})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full"></span> Absent ({attendanceSummary.absent})</span>
            </div>
          </div>

          {/* Recent Results */}
          {recentResults.length > 0 && (
            <div className="ds-card mb-6">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Recent Results</h3>
              <div className="space-y-2">
                {recentResults.slice(0, 5).map(r => {
                  const pct = Number(r.assessment?.totalMarks) > 0 ? Math.round((Number(r.score) / Number(r.assessment.totalMarks)) * 100) : 0;
                  return (
                    <div key={r.id} className="ds-surface-muted flex flex-wrap items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-medium text-sm text-gray-800 dark:text-white">{r.assessment?.title}</p>
                        <p className="text-xs text-gray-500">{r.assessment?.subject?.name} • {r.assessment?.type}</p>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold text-sm ${getGradeColor(pct)}`}>{Number(r.score)}/{Number(r.assessment?.totalMarks)}</span>
                        <div className={`text-xs ${getGradeColor(pct)}`}>{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Assessments */}
          {upcomingAssessments.length > 0 && (
            <div className="ds-card">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Upcoming Assessments</h3>
              <div className="space-y-2">
                {upcomingAssessments.map(a => (
                  <div key={a.id} className="ds-surface-muted flex flex-wrap items-center gap-3 p-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-800 dark:text-white">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.subject?.name} • {a.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{new Date(a.date).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-500">{Number(a.totalMarks)} marks</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'grades' && (
        <div className="ds-card">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Current Term Grades</h3>
          {currentGrades.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No grades recorded for this term yet</p>
          ) : (
            <div className="space-y-3">
              {currentGrades.map(g => {
                const score = Number(g.totalScore);
                return (
                  <div key={g.id} className="ds-surface-muted flex flex-wrap items-center gap-4 p-4">
                    <div className={`ds-badge justify-center ${getGradeBg(score)}`} aria-label={`Grade ${getGradeLetter(score)}`}>
                      {getGradeLetter(score)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 dark:text-white">{g.subject?.name}</p>
                      <div className="mt-1 w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(score, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-bold ${getGradeColor(score)}`}>{score}%</span>
                      {g.remarks && <p className="text-xs text-gray-500 mt-0.5">{g.remarks}</p>}
                    </div>
                  </div>
                );
              })}

              {/* Overall Average */}
              <div className="border-t border-gray-200 dark:border-slate-600 pt-3 mt-3 flex justify-between items-center">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Overall Average</span>
                <span className={`text-xl font-bold ${getGradeColor(overallAverage)}`}>{overallAverage}%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="ds-card">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Performance Trends</h3>
          {!trendData || trendData.trends.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Not enough data for trend analysis yet</p>
          ) : (
            <>
              {/* Simple bar chart for average per term */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Average Score by Term</h4>
                <div className="flex items-end gap-4 h-48">
                  {trendData.trends.map((term: any, i: number) => {
                    const maxAvg = Math.max(...trendData.trends.map((t: any) => t.average));
                    const height = maxAvg > 0 ? (term.average / 100) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{Math.round(term.average)}%</span>
                        <div className="w-full max-w-[60px] rounded-t-lg transition-all"
                          style={{
                            height: `${height}%`,
                            backgroundColor: term.average >= 80 ? '#10b981' : term.average >= 60 ? '#3b82f6' : term.average >= 40 ? '#f59e0b' : '#ef4444',
                            minHeight: '8px',
                          }}
                        />
                        <span className="text-xs text-[var(--text-secondary)] text-center">{term.term}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subject breakdown table */}
              <div>
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Subject Scores per Term</h4>
                <div className="overflow-x-auto" role="region" aria-label="Subject scores per term" tabIndex={0}>
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th scope="col">Subject</th>
                        {trendData.trends.map((t: any, i: number) => (
                          <th key={i} scope="col" className="text-center">{t.term}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trendData.subjects.map((subj, si) => (
                        <tr key={subj}>
                          <td className="font-medium">{subj}</td>
                          {trendData.trends.map((term: any, ti: number) => {
                            const score = term.subjects[subj];
                            return (
                              <td key={ti} className="text-center">
                                {score !== undefined ? (
                                  <span className={`font-medium ${getGradeColor(score)}`}>{Math.round(score)}%</span>
                                ) : (
                                  <span className="text-[var(--text-secondary)]" aria-label="No score recorded">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'assessments' && (
        <div className="ds-card">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4">All Assessment Results</h3>
          {recentResults.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No assessment results yet</p>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="All assessment results" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th scope="col">Assessment</th>
                    <th scope="col">Subject</th>
                    <th scope="col" className="text-center">Type</th>
                    <th scope="col" className="text-center">Score</th>
                    <th scope="col" className="text-center">%</th>
                    <th scope="col" className="text-center">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {recentResults.map(r => {
                    const pct = Number(r.assessment?.totalMarks) > 0 ? Math.round((Number(r.score) / Number(r.assessment.totalMarks)) * 100) : 0;
                    return (
                      <tr key={r.id}>
                        <td className="font-medium">{r.assessment?.title}</td>
                        <td>{r.assessment?.subject?.name}</td>
                        <td className="text-center">
                          <span className="ds-badge ds-badge-neutral">{r.assessment?.type}</span>
                        </td>
                        <td className="text-center font-medium">{Number(r.score)}/{Number(r.assessment?.totalMarks)}</td>
                        <td className={`text-center font-bold ${getGradeColor(pct)}`}>{pct}%</td>
                        <td className="text-center">
                          <span className={`ds-badge justify-center ${getGradeBg(pct)}`}>
                            {getGradeLetter(pct)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </TabPanel>
    </div>
  );
};

export default StudentAcademicPortal;
