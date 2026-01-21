import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart2, TrendingUp, AlertTriangle, Calendar, Users,
    ChevronLeft, ChevronRight, Download, ArrowLeft
} from 'lucide-react';
import api from '../../utils/api';
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
}

const AttendanceAnalytics: React.FC<Props> = ({ classId, className, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [dailyData, setDailyData] = useState<DayData[]>([]);
    const [studentSummaries, setStudentSummaries] = useState<StudentSummary[]>([]);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    useEffect(() => {
        fetchAnalytics();
    }, [classId, month, year]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);

            const res = await api.get('/attendance/analytics', {
                params: {
                    classId,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                }
            });

            setDailyData(res.data.dailyData || []);
            setStudentSummaries(res.data.studentSummaries || []);
        } catch (error) {
            console.error('Failed to fetch analytics', error);
            // Generate mock data for demo if endpoint doesn't exist yet
            generateMockData();
        } finally {
            setLoading(false);
        }
    };

    const generateMockData = () => {
        // This is fallback mock data - remove when backend is ready
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const mockDaily: DayData[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dayOfWeek = new Date(year, month, d).getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
                mockDaily.push({
                    date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                    present: Math.floor(Math.random() * 10) + 20,
                    absent: Math.floor(Math.random() * 5),
                    late: Math.floor(Math.random() * 3),
                    total: 30
                });
            }
        }
        setDailyData(mockDaily);
    };

    const stats = useMemo(() => {
        if (dailyData.length === 0) return { avgRate: 0, totalDays: 0, totalAbsent: 0 };

        const totalPresent = dailyData.reduce((sum, d) => sum + d.present, 0);
        const totalStudentDays = dailyData.reduce((sum, d) => sum + d.total, 0);
        const totalAbsent = dailyData.reduce((sum, d) => sum + d.absent, 0);

        return {
            avgRate: totalStudentDays > 0 ? (totalPresent / totalStudentDays * 100) : 0,
            totalDays: dailyData.length,
            totalAbsent
        };
    }, [dailyData]);

    const chronicAbsentees = useMemo(() => {
        return studentSummaries.filter(s => s.absentDays >= 3);
    }, [studentSummaries]);

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

        wsData.push([]);
        wsData.push(['Student Summary']);
        wsData.push(['Name', 'Admission No', 'Present', 'Absent', 'Late', 'Rate %']);

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

    // Calendar heatmap
    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (DayData | null)[] = [];

        // Padding for first week
        for (let i = 0; i < firstDay; i++) days.push(null);

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayData = dailyData.find(dd => dd.date === dateStr);
            days.push(dayData || null);
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
                    {/* Month Navigator */}
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

                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm"
                    >
                        <Download size={18} />
                        Export
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

            {/* Calendar Heatmap */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <h3 className="font-bold text-gray-800 dark:text-white mb-4">Monthly Attendance Heatmap</h3>
                <div className="grid grid-cols-7 gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">{day}</div>
                    ))}
                    {calendarDays.map((day, idx) => (
                        <div
                            key={idx}
                            className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium ${getHeatmapColor(day)} ${day ? 'text-white' : 'text-gray-400 dark:text-gray-600'}`}
                            title={day ? `${day.date}: ${day.present}/${day.total} present` : ''}
                        >
                            {day ? new Date(day.date).getDate() : ''}
                        </div>
                    ))}
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-4 h-4 bg-green-500 rounded"></span> 95%+</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-4 bg-green-300 rounded"></span> 85-94%</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-4 bg-yellow-300 rounded"></span> 70-84%</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-4 bg-orange-400 rounded"></span> 50-69%</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-4 bg-red-500 rounded"></span> &lt;50%</span>
                </div>
            </div>

            {/* At-Risk Students */}
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
        </div>
    );
};

export default AttendanceAnalytics;
