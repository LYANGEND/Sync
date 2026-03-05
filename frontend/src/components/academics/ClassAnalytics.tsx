import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { BarChart2, Users, Award, TrendingUp } from 'lucide-react';

interface ClassAnalyticsData {
  classAverage: number;
  subjectAverages: {
    subjectId: string;
    subjectName: string;
    average: number;
    highest: number;
    lowest: number;
    studentCount: number;
  }[];
  studentRankings: {
    rank: number;
    studentId: string;
    student: { firstName: string; lastName: string; admissionNumber: string };
    average: number;
    subjectCount: number;
  }[];
  gradeDistribution: Record<string, number>;
  totalStudents: number;
}

interface Props {
  classId: string;
  termId: string;
  className?: string;
}

const ClassAnalytics: React.FC<Props> = ({ classId, termId, className }) => {
  const [data, setData] = useState<ClassAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'overview' | 'rankings' | 'subjects'>('overview');

  useEffect(() => {
    if (classId && termId) {
      fetchAnalytics();
    }
  }, [classId, termId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/student-portal/class/${classId}/analytics`, { params: { termId } });
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-gray-500">
        <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No analytics data available</p>
      </div>
    );
  }

  const getBarColor = (avg: number) => {
    if (avg >= 80) return '#10b981';
    if (avg >= 60) return '#3b82f6';
    if (avg >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className={className}>
      {/* View Tabs */}
      <div className="flex gap-1 mb-4">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart2 },
          { id: 'rankings', label: 'Rankings', icon: Award },
          { id: 'subjects', label: 'Subjects', icon: TrendingUp },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              activeView === tab.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
              <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{data.classAverage}%</div>
              <div className="text-xs text-gray-500">Class Average</div>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{data.totalStudents}</div>
              <div className="text-xs text-gray-500">Students</div>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-center">
              <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{data.subjectAverages.length}</div>
              <div className="text-xs text-gray-500">Subjects</div>
            </div>
          </div>

          {/* Grade Distribution */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Grade Distribution</h4>
            <div className="space-y-2">
              {Object.entries(data.gradeDistribution).map(([grade, count]) => {
                const total = Object.values(data.gradeDistribution).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={grade} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-16 text-gray-600 dark:text-gray-400">{grade}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-full h-5 overflow-hidden">
                      <div className="h-full rounded-full flex items-center justify-end px-1.5"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: getBarColor(grade.includes('A') ? 90 : grade.includes('B') ? 70 : grade.includes('C') ? 50 : grade.includes('D') ? 30 : 10) }}>
                        <span className="text-[10px] text-white font-bold">{count}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">{Math.round(pct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subject Performance Chart */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Subject Averages</h4>
            <div className="flex items-end gap-2 h-40">
              {data.subjectAverages.map((s, i) => (
                <div key={s.subjectId} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{Math.round(s.average)}%</span>
                  <div className="w-full rounded-t-lg transition-all" style={{
                    height: `${(s.average / 100) * 100}%`,
                    backgroundColor: getBarColor(s.average),
                    minHeight: '8px',
                  }} />
                  <span className="text-[9px] text-gray-500 text-center leading-tight truncate w-full">{s.subjectName}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeView === 'rankings' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-2 font-medium text-gray-500 w-12">#</th>
                <th className="text-left py-2 font-medium text-gray-500">Student</th>
                <th className="text-center py-2 font-medium text-gray-500">Subjects</th>
                <th className="text-right py-2 font-medium text-gray-500">Average</th>
              </tr>
            </thead>
            <tbody>
              {data.studentRankings.map(s => (
                <tr key={s.studentId} className="border-b border-gray-100 dark:border-slate-700/50">
                  <td className="py-2">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      s.rank <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {s.rank}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="font-medium text-gray-800 dark:text-white">{s.student.firstName} {s.student.lastName}</div>
                    <div className="text-xs text-gray-500">{s.student.admissionNumber}</div>
                  </td>
                  <td className="py-2 text-center text-gray-600 dark:text-gray-400">{s.subjectCount}</td>
                  <td className="py-2 text-right">
                    <span className={`font-bold ${s.average >= 80 ? 'text-green-600' : s.average >= 60 ? 'text-blue-600' : s.average >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {s.average}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'subjects' && (
        <div className="space-y-3">
          {data.subjectAverages.map(s => (
            <div key={s.subjectId} className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-medium text-gray-800 dark:text-white">{s.subjectName}</h5>
                <span className={`font-bold ${s.average >= 80 ? 'text-green-600' : s.average >= 60 ? 'text-blue-600' : s.average >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {s.average}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2 mb-2">
                <div className="h-2 rounded-full" style={{ width: `${s.average}%`, backgroundColor: getBarColor(s.average) }} />
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Highest: <strong className="text-green-600">{s.highest}%</strong></span>
                <span>Lowest: <strong className="text-red-600">{s.lowest}%</strong></span>
                <span>Students: <strong>{s.studentCount}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassAnalytics;
