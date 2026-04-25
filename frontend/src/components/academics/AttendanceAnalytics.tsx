import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart2, TrendingUp, AlertTriangle, Calendar, Users,
    ChevronLeft, ChevronRight, Download, ArrowLeft, Bell,
    CheckCircle, Shield, Activity
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { useAppDialog } from '../ui/AppDialogProvider';
import * as XLSX from 'xlsx';

interface Props {
    classId: string;
    className: string;
    onBack: () => void;
}

interface DayData {
    date: string;
    present: number;
    absent: number;
    late: number;
    total: number;
}

interface StudentSummary {
    studentId: string;
    studentName: string;
    admissionNumber: string;
    presentDays: number;
    absentDays: number;
    lateDays: number;
    attendanceRate: number;
    profileImageUrl?: string;
    streak?: { type: string; count: number };
    sparkline?: number[];
    reasons?: Record<string, number>;
    alerts?: any[];
}

interface AttendanceAlert {
    id: string;
    studentId: string;
    studentName?: string;
    alertType: string;
    message: string;
    resolved: boolean;
    resolvedAt?: string;
    resolvedNotes?: string;
    createdAt: string;
}

interface DashboardData {
    todayStats: { totalStudents: number; totalPresent: number; totalAbsent: number; totalLate: number; rate: number };
    classBreakdown: Array<{ classId: string; className: string; present: number; absent: number; late: number; total: number; submitted: boolean }>;
    unresolvedAlerts: number;
}

const AttendanceAnalytics: React.FC<Props> = ({ classId, className, onBack }) => {
    const { prompt } = useAppDialog();
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [dailyData, setDailyData] = useState<DayData[]>([]);
    const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([]);
    const [alerts, setAlerts] = useState<AttendanceAlert[]>([]);
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'alerts' | 'dashboard'>('overview');

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    useEffect(() => {
        if (!classId) {
            setDailyData([]);
            setStudentSummaries([]);
            setLoading(false);
            return;
        }
        fetchAnalytics();
    }, [classId, month, year]);
    useEffect(() => {
        if (!classId) {
            setAlerts([]);
            return;
        }
        fetchAlerts();
    }, [classId]);
    useEffect(() => { fetchDashboard(); }, []);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            const res = await api.get('/attendance/analytics', {
                params: { classId, startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] }
            });
            setDailyData(res.data.dailyData || []);
            setStudentSummaries(res.data.studentSummaries || []);
        } catch (error) {
            console.error('Failed to fetch analytics', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAlerts = async () => {
        try {
            const res = await api.get('/attendance/alerts', { params: { classId, resolved: false } });
            setAlerts(res.data || []);
        } catch { /* alerts endpoint may not exist yet */ }
    };

    const fetchDashboard = async () => {
        try {
            const res = await api.get('/attendance/dashboard');
            setDashboard(res.data);
        } catch { /* dashboard endpoint may not exist yet */ }
    };

    const resolveAlert = async (alertId: string, notes: string) => {
        try {
            await api.patch(`/attendance/alerts/${alertId}/resolve`, { notes });
            toast.success('Alert resolved');
            fetchAlerts();
        } catch {
            toast.error('Failed to resolve alert');
        }
    };

    const stats = useMemo(() => {
        if (dailyData.length === 0) return { avgRate: 0, totalDays: 0, totalAbsent: 0, totalLate: 0 };
        const totalPresent = dailyData.reduce((sum, d) => sum + d.present, 0);
        const totalStudentDays = dailyData.reduce((sum, d) => sum + d.total, 0);
        const totalAbsent = dailyData.reduce((sum, d) => sum + d.absent, 0);
        const totalLate = dailyData.reduce((sum, d) => sum + d.late, 0);
        return {
            avgRate: totalStudentDays > 0 ? (totalPresent / totalStudentDays * 100) : 0,
            totalDays: dailyData.length,
            totalAbsent,
            totalLate
        };
    }, [dailyData]);

    const chronicAbsentees = useMemo(() => studentSummaries.filter(s => s.absentDays >= 3), [studentSummaries]);

    // Trend line SVG
    const TrendChart = ({ data }: { data: DayData[] }) => {
        if (data.length < 2) return null;
        const w = 600, h = 120, pad = 30;
        const rates = data.map(d => d.total > 0 ? (d.present / d.total) * 100 : 0);
        const maxR = 100, minR = Math.min(...rates, 50);
        const xStep = (w - pad * 2) / (rates.length - 1);
        const yScale = (v: number) => h - pad - ((v - minR) / (maxR - minR)) * (h - pad * 2);
        const points = rates.map((r, i) => `${pad + i * xStep},${yScale(r)}`).join(' ');
        const avgLine = yScale(stats.avgRate);

        return (
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
                {/* Grid lines */}
                {[50, 70, 85, 100].map(v => (
                    <g key={v}>
                        <line x1={pad} y1={yScale(v)} x2={w - pad} y2={yScale(v)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4,4" />
                        <text x={pad - 4} y={yScale(v) + 3} textAnchor="end" className="fill-gray-400" fontSize="9">{v}%</text>
                    </g>
                ))}
                {/* Average line */}
                <line x1={pad} y1={avgLine} x2={w - pad} y2={avgLine} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6,3" />
                {/* Trend line */}
                <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" />
                {/* Dots */}
                {rates.map((r, i) => (
                    <circle key={i} cx={pad + i * xStep} cy={yScale(r)} r="3" fill={r >= 85 ? '#10b981' : r >= 70 ? '#f59e0b' : '#ef4444'} />
                ))}
            </svg>
        );
    };

    // Student sparkline
    const Sparkline = ({ data }: { data: number[] }) => {
        if (!data || data.length < 2) return null;
        const w = 80, h = 20;
        const step = w / (data.length - 1);
        const points = data.map((v, i) => `${i * step},${h - v * h}`).join(' ');
        return (
            <svg width={w} height={h} className="inline-block">
                <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
            </svg>
        );
    };

    const handleExport = () => {
        const wsData: any[][] = [
            [`Attendance Report: ${className} - ${monthNames[month]} ${year}`],
            [],
            ['Date', 'Present', 'Absent', 'Late', 'Rate %']
        ];
        dailyData.forEach(d => {
            const rate = d.total > 0 ? ((d.present / d.total) * 100).toFixed(1) : '0';
            wsData.push([d.date, d.present, d.absent, d.late, rate]);
        });
        wsData.push([], ['Student Summary'], ['Name', 'Admission No', 'Present', 'Absent', 'Late', 'Rate %']);
        studentSummaries.forEach(s => {
            wsData.push([s.studentName, s.admissionNumber, s.presentDays, s.absentDays, s.lateDays, s.attendanceRate.toFixed(1)]);
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");
        XLSX.writeFile(wb, `Attendance_${className}_${monthNames[month]}_${year}.xlsx`);
    };

    const changeMonth = (delta: number) => {
        let newMonth = month + delta;
        let newYear = year;
        if (newMonth < 0) { newMonth = 11; newYear--; }
        if (newMonth > 11) { newMonth = 0; newYear++; }
        setMonth(newMonth);
        setYear(newYear);
    };

    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (DayData | null)[] = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push(dailyData.find(dd => dd.date === dateStr) || null);
        }
        return days;
    }, [dailyData, month, year]);

    const getHeatmapColor = (data: DayData | null) => {
        if (!data) return 'bg-gray-100 dark:bg-slate-700';
        const rate = data.total > 0 ? (data.present / data.total) : 0;
        if (rate >= 0.95) return 'bg-green-500';
        if (rate >= 0.85) return 'bg-green-300';
        if (rate >= 0.70) return 'bg-yellow-300';
        if (rate >= 0.50) return 'bg-orange-400';
        return 'bg-red-500';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white flex items-center mb-2 text-sm">
                        <ArrowLeft size={16} className="mr-1" /> Back to Register
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <BarChart2 className="text-purple-600" />
                        Attendance Analytics
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400">{className}</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                            <ChevronLeft size={18} className="text-gray-600 dark:text-gray-400" />
                        </button>
                        <span className="font-medium text-gray-800 dark:text-white min-w-[140px] text-center">
                            {monthNames[month]} {year}
                        </span>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
                            <ChevronRight size={18} className="text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                    <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm">
                        <Download size={18} /> Export
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
                {(['overview', 'students', 'alerts', 'dashboard'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                        {tab === 'alerts' && alerts.length > 0 && (
                            <span className="w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">{alerts.length}</span>
                        )}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Average Rate</div>
                                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.avgRate.toFixed(1)}%</div>
                                </div>
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                                    <TrendingUp className="text-blue-600 dark:text-blue-400" size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">School Days</div>
                                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalDays}</div>
                                </div>
                                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                                    <Calendar className="text-purple-600 dark:text-purple-400" size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Absences</div>
                                    <div className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.totalAbsent}</div>
                                </div>
                                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                    <Users className="text-red-600 dark:text-red-400" size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">At-Risk Students</div>
                                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{chronicAbsentees.length}</div>
                                </div>
                                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                                    <AlertTriangle className="text-orange-600 dark:text-orange-400" size={24} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trend Chart */}
                    {dailyData.length >= 2 && (
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                                <Activity size={18} className="text-green-600" /> Daily Attendance Trend
                            </h3>
                            <TrendChart data={dailyData} />
                            <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1"><span className="w-3 h-1.5 bg-green-500 rounded-full" /> Trend</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-1.5 bg-blue-500 rounded-full" /> Average ({stats.avgRate.toFixed(0)}%)</span>
                            </div>
                        </div>
                    )}

                    {/* Calendar Heatmap */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                        <h3 className="font-bold text-gray-800 dark:text-white mb-4">Monthly Attendance Heatmap</h3>
                        <div className="grid grid-cols-7 gap-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">{day}</div>
                            ))}
                            {calendarDays.map((day, idx) => (
                                <div key={idx}
                                    className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium ${getHeatmapColor(day)} ${day ? 'text-white' : 'text-gray-400 dark:text-gray-600'}`}
                                    title={day ? `${day.date}: ${day.present}/${day.total} present` : ''}>
                                    {day ? new Date(day.date).getDate() : ''}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-green-500 rounded" /> 95%+</span>
                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-green-300 rounded" /> 85-94%</span>
                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-300 rounded" /> 70-84%</span>
                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-orange-400 rounded" /> 50-69%</span>
                            <span className="flex items-center gap-1"><span className="w-4 h-4 bg-red-500 rounded" /> &lt;50%</span>
                        </div>
                    </div>

                    {/* Chronic Absentees */}
                    {chronicAbsentees.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-orange-200 dark:border-orange-900/50 shadow-sm">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="text-orange-500" size={20} />
                                Chronic Absenteeism Alert (3+ absences)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {chronicAbsentees.map(student => (
                                    <div key={student.studentId} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-900/30">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">{student.studentName}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{student.admissionNumber}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-bold text-red-600 dark:text-red-400">{student.absentDays}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">absences</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ STUDENTS TAB ═══ */}
            {activeTab === 'students' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Student Performance</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Present</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Absent</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Late</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Rate</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Streak</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Trend</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {studentSummaries.map(s => (
                                    <tr key={s.studentId} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                {s.profileImageUrl ? (
                                                    <img src={s.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs">
                                                        {s.studentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-medium text-gray-900 dark:text-white text-sm">{s.studentName}</div>
                                                    <div className="text-xs text-gray-400">{s.admissionNumber}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm font-medium text-green-600">{s.presentDays}</td>
                                        <td className="px-4 py-3 text-center text-sm font-medium text-red-600">{s.absentDays}</td>
                                        <td className="px-4 py-3 text-center text-sm font-medium text-orange-600">{s.lateDays}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${s.attendanceRate >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : s.attendanceRate >= 75 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                {s.attendanceRate.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {s.streak && s.streak.count >= 2 && (
                                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${s.streak.type === 'ABSENT' ? 'bg-red-100 text-red-700' : s.streak.type === 'LATE' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                                                    {s.streak.type === 'ABSENT' ? '🔴' : s.streak.type === 'LATE' ? '🟠' : '🟢'} {s.streak.count}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {s.sparkline && <Sparkline data={s.sparkline} />}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ ALERTS TAB ═══ */}
            {activeTab === 'alerts' && (
                <div className="space-y-4">
                    {alerts.length === 0 ? (
                        <div className="bg-white dark:bg-slate-800 p-12 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
                            <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-white">No Active Alerts</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">All attendance alerts have been resolved.</p>
                        </div>
                    ) : (
                        alerts.map(alert => (
                            <div key={alert.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border-l-4 border-l-red-500 border border-gray-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Bell size={16} className="text-red-500" />
                                            <span className="font-bold text-gray-900 dark:text-white">{alert.studentName || 'Student'}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{alert.message}</p>
                                        <p className="text-xs text-gray-400 mt-1">{new Date(alert.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <button onClick={async () => {
                                        const notes = await prompt({
                                            title: 'Resolve attendance alert',
                                            message: 'Add optional notes for how this alert was handled.',
                                            placeholder: 'e.g. Called guardian and scheduled follow-up',
                                            confirmText: 'Resolve alert',
                                            cancelText: 'Keep open',
                                        });
                                        if (notes === null) return;
                                        resolveAlert(alert.id, notes);
                                    }}
                                        className="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium dark:bg-green-900/20 dark:text-green-400">
                                        ✓ Resolve
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ═══ SCHOOL DASHBOARD TAB ═══ */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {dashboard ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Today's Students</div>
                                    <div className="text-3xl font-bold text-gray-900 dark:text-white">{dashboard.todayStats.totalStudents}</div>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-green-500">
                                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Present Today</div>
                                    <div className="text-3xl font-bold text-green-700 dark:text-green-400">{dashboard.todayStats.totalPresent}</div>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-blue-500">
                                    <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Attendance Rate</div>
                                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{dashboard.todayStats.rate?.toFixed(1) || 0}%</div>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
                                    <div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Unresolved Alerts</div>
                                    <div className="text-3xl font-bold text-red-700 dark:text-red-400">{dashboard.unresolvedAlerts}</div>
                                </div>
                            </div>

                            {/* Class Breakdown */}
                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                                    <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <Shield size={18} className="text-blue-600" /> Class-by-Class Today
                                    </h3>
                                </div>
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 dark:bg-slate-700">
                                        <tr>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Class</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Present</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Absent</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Late</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Rate</th>
                                            <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                        {dashboard.classBreakdown.map(cls => {
                                            const rate = cls.total > 0 ? (cls.present / cls.total * 100) : 0;
                                            return (
                                                <tr key={cls.classId} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white text-sm">{cls.className}</td>
                                                    <td className="px-4 py-3 text-center text-sm text-green-600 font-medium">{cls.present}</td>
                                                    <td className="px-4 py-3 text-center text-sm text-red-600 font-medium">{cls.absent}</td>
                                                    <td className="px-4 py-3 text-center text-sm text-orange-600 font-medium">{cls.late}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rate >= 90 ? 'bg-green-100 text-green-700' : rate >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                            {rate.toFixed(0)}%
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {cls.submitted ? (
                                                            <span className="text-green-600 text-xs font-medium flex items-center justify-center gap-1"><CheckCircle size={14} /> Submitted</span>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs font-medium">Pending</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white dark:bg-slate-800 p-12 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
                            <Shield size={48} className="mx-auto text-gray-300 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-white">Dashboard Unavailable</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">School-wide dashboard requires admin access.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AttendanceAnalytics;
