import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Save, CheckCircle, XCircle, Clock, UserCheck,
    Search, BarChart2, Download, ChevronLeft, ChevronRight,
    MessageSquare, FileText, Printer
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import AttendanceAnalytics from '../../components/academics/AttendanceAnalytics';
import * as XLSX from 'xlsx';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
}

interface AttendanceRecord {
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    reason?: string;
    arrivalTime?: string;
}

type ViewMode = 'daily' | 'weekly' | 'analytics';

const AttendanceRegister = () => {
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedClassName, setSelectedClassName] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('daily');

    // Weekly view state
    const [weekDates, setWeekDates] = useState<string[]>([]);
    const [weeklyAttendance, setWeeklyAttendance] = useState<Record<string, Record<string, 'PRESENT' | 'ABSENT' | 'LATE'>>>({});

    // Reason modal
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [reasonStudent, setReasonStudent] = useState<Student | null>(null);
    const [reasonText, setReasonText] = useState('');

    useEffect(() => {
        fetchClasses();
    }, []);

    useEffect(() => {
        if (selectedClassId && date && viewMode === 'daily') {
            fetchAttendanceData();
        }
    }, [selectedClassId, date, viewMode]);

    useEffect(() => {
        if (selectedClassId && viewMode === 'weekly') {
            generateWeekDates();
            fetchWeeklyData();
        }
    }, [selectedClassId, date, viewMode]);

    const fetchClasses = async () => {
        try {
            const response = await api.get('/classes');
            setClasses(response.data);
            if (response.data.length > 0) {
                setSelectedClassId(response.data[0].id);
                setSelectedClassName(response.data[0].name);
            }
        } catch (error) {
            console.error('Error fetching classes:', error);
        }
    };

    const generateWeekDates = () => {
        const current = new Date(date);
        const dayOfWeek = current.getDay();
        const monday = new Date(current);
        monday.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        const dates: string[] = [];
        for (let i = 0; i < 5; i++) { // Mon-Fri
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        setWeekDates(dates);
    };

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            const classRes = await api.get(`/classes/${selectedClassId}`);
            const classStudents = classRes.data.students || [];
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents(classStudents);

            const attendanceRes = await api.get(`/attendance?classId=${selectedClassId}&date=${date}`);
            const existingRecords = attendanceRes.data;

            const initialAttendance: Record<string, AttendanceRecord> = {};
            classStudents.forEach((student: any) => {
                const record = existingRecords.find((r: any) => r.studentId === student.id);
                initialAttendance[student.id] = {
                    studentId: student.id,
                    status: record ? record.status : 'PRESENT',
                    reason: record?.reason || '',
                    arrivalTime: record?.arrivalTime || ''
                };
            });
            setAttendance(initialAttendance);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Failed to load class list');
        } finally {
            setLoading(false);
        }
    };

    const fetchWeeklyData = async () => {
        setLoading(true);
        try {
            const classRes = await api.get(`/classes/${selectedClassId}`);
            const classStudents = classRes.data.students || [];
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents(classStudents);

            // Fetch attendance for each day of the week
            const weekData: Record<string, Record<string, 'PRESENT' | 'ABSENT' | 'LATE'>> = {};

            for (const d of weekDates) {
                const res = await api.get(`/attendance?classId=${selectedClassId}&date=${d}`);
                res.data.forEach((r: any) => {
                    if (!weekData[r.studentId]) weekData[r.studentId] = {};
                    weekData[r.studentId][d] = r.status;
                });
            }

            setWeeklyAttendance(weekData);
        } catch (error) {
            console.error('Error fetching weekly data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
        setAttendance(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], status }
        }));

        // Open reason modal for absence
        if (status === 'ABSENT') {
            const student = students.find(s => s.id === studentId);
            if (student) {
                setReasonStudent(student);
                setReasonText(attendance[studentId]?.reason || '');
                setShowReasonModal(true);
            }
        }
    };

    const handleSaveReason = () => {
        if (reasonStudent) {
            setAttendance(prev => ({
                ...prev,
                [reasonStudent.id]: { ...prev[reasonStudent.id], reason: reasonText }
            }));
        }
        setShowReasonModal(false);
        setReasonStudent(null);
        setReasonText('');
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const records = Object.entries(attendance).map(([studentId, data]) => ({
                studentId,
                status: data.status
            }));

            await api.post('/attendance', {
                classId: selectedClassId,
                date: new Date(date).toISOString(),
                records
            });

            toast.success('Attendance saved successfully');
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    const markAll = (status: 'PRESENT' | 'ABSENT') => {
        const newAttendance = { ...attendance };
        filteredStudents.forEach(s => {
            newAttendance[s.id] = { ...newAttendance[s.id], status };
        });
        setAttendance(newAttendance);
    };

    const filteredStudents = useMemo(() => {
        if (!searchQuery) return students;
        const q = searchQuery.toLowerCase();
        return students.filter(s =>
            s.firstName.toLowerCase().includes(q) ||
            s.lastName.toLowerCase().includes(q) ||
            s.admissionNumber.toLowerCase().includes(q)
        );
    }, [students, searchQuery]);

    const stats = useMemo(() => {
        const total = students.length;
        const present = Object.values(attendance).filter(a => a.status === 'PRESENT').length;
        const absent = Object.values(attendance).filter(a => a.status === 'ABSENT').length;
        const late = Object.values(attendance).filter(a => a.status === 'LATE').length;
        return { total, present, absent, late };
    }, [attendance, students]);

    const handleExportDaily = () => {
        const wsData: any[][] = [
            [`Daily Attendance: ${selectedClassName} - ${date}`],
            [],
            ['#', 'Admission No', 'Student Name', 'Status', 'Reason']
        ];

        filteredStudents.forEach((s, idx) => {
            const a = attendance[s.id];
            wsData.push([
                idx + 1,
                s.admissionNumber,
                `${s.firstName} ${s.lastName}`,
                a?.status || '-',
                a?.reason || ''
            ]);
        });

        wsData.push([]);
        wsData.push(['Summary']);
        wsData.push(['Present', stats.present]);
        wsData.push(['Absent', stats.absent]);
        wsData.push(['Late', stats.late]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");
        XLSX.writeFile(wb, `Attendance_${selectedClassName}_${date}.xlsx`);
    };

    const handlePrint = () => {
        window.print();
    };

    const changeDate = (delta: number) => {
        const d = new Date(date);
        d.setDate(d.getDate() + delta);
        setDate(d.toISOString().split('T')[0]);
    };

    if (viewMode === 'analytics') {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <AttendanceAnalytics
                    classId={selectedClassId}
                    className={selectedClassName}
                    onBack={() => setViewMode('daily')}
                />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto print:p-0 printable-content">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <UserCheck className="text-blue-600" />
                        Class Attendance
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">Daily register and attendance tracking</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* View Mode Toggle */}
                    <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'daily' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Daily
                        </button>
                        <button
                            onClick={() => setViewMode('weekly')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'weekly' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Weekly
                        </button>
                        <button
                            onClick={() => setViewMode('analytics')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === 'analytics' ? 'bg-white dark:bg-slate-600 shadow-sm text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            <BarChart2 size={14} />
                            Analytics
                        </button>
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mb-6 flex flex-wrap items-center gap-4">
                {/* Class Select */}
                <select
                    value={selectedClassId}
                    onChange={(e) => {
                        setSelectedClassId(e.target.value);
                        setSelectedClassName(classes.find(c => c.id === e.target.value)?.name || '');
                    }}
                    className="px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-slate-700 dark:text-white"
                >
                    {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                {/* Date Navigator */}
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg p-1">
                    <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded transition-colors dark:text-gray-300">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="relative">
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-transparent focus:outline-none w-36 dark:text-white"
                        />
                    </div>
                    <button onClick={() => changeDate(1)} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded transition-colors dark:text-gray-300">
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search student..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={handleExportDaily}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="Export to Excel"
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors print:hidden"
                        title="Print"
                    >
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print:hidden">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-green-500">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Present</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.present}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
                    <div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Absent</div>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.absent}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
                    <div className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1">Late</div>
                    <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.late}</div>
                </div>
            </div>

            {/* Main Register - Daily View */}
            {viewMode === 'daily' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 print:bg-white">
                        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Student Register</h2>
                        <div className="flex gap-2 print:hidden">
                            <button
                                onClick={() => markAll('PRESENT')}
                                className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                            >
                                Mark All Present
                            </button>
                            <button
                                onClick={() => markAll('ABSENT')}
                                className="text-xs font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                            >
                                Mark All Absent
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            Loading register...
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            {searchQuery ? 'No students match your search.' : 'No students found in this class.'}
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">#</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center print:hidden">Status</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden print:table-cell">Status</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider print:hidden">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {filteredStudents.map((student, index) => (
                                    <tr key={student.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{index + 1}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                                    {student.firstName[0]}{student.lastName[0]}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900 dark:text-white">{student.firstName} {student.lastName}</div>
                                                    <div className="text-xs text-gray-400 dark:text-gray-500">{student.admissionNumber}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 print:hidden">
                                            <div className="flex items-center justify-center gap-2">
                                                {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => {
                                                    const isActive = attendance[student.id]?.status === status;
                                                    const colors = {
                                                        PRESENT: { active: 'bg-green-100 text-green-700 ring-2 ring-green-500', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
                                                        ABSENT: { active: 'bg-red-100 text-red-700 ring-2 ring-red-500', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
                                                        LATE: { active: 'bg-orange-100 text-orange-700 ring-2 ring-orange-500', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100' }
                                                    };
                                                    const icons = { PRESENT: CheckCircle, ABSENT: XCircle, LATE: Clock };
                                                    const Icon = icons[status];

                                                    return (
                                                        <button
                                                            key={status}
                                                            onClick={() => handleStatusChange(student.id, status)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ring-offset-1 ${isActive ? colors[status].active : colors[status].inactive}`}
                                                        >
                                                            <Icon size={16} />
                                                            <span className="hidden sm:inline">{status.charAt(0) + status.slice(1).toLowerCase()}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 hidden print:table-cell text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${attendance[student.id]?.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                                                attendance[student.id]?.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                                                    'bg-orange-100 text-orange-700'
                                                }`}>
                                                {attendance[student.id]?.status || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 print:hidden">
                                            {attendance[student.id]?.status === 'ABSENT' && (
                                                <button
                                                    onClick={() => {
                                                        setReasonStudent(student);
                                                        setReasonText(attendance[student.id]?.reason || '');
                                                        setShowReasonModal(true);
                                                    }}
                                                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
                                                >
                                                    <MessageSquare size={14} />
                                                    {attendance[student.id]?.reason ? 'Edit Reason' : 'Add Reason'}
                                                </button>
                                            )}
                                            {attendance[student.id]?.reason && (
                                                <div className="text-xs text-gray-400 mt-1 truncate max-w-[150px]" title={attendance[student.id]?.reason}>
                                                    {attendance[student.id]?.reason}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Weekly View */}
            {viewMode === 'weekly' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Weekly View</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Week of {weekDates[0] ? new Date(weekDates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} -
                            {weekDates[4] ? new Date(weekDates[4]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                        </p>
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            Loading...
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                                    <tr>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase sticky left-0 bg-gray-50 dark:bg-slate-700 z-10">Student</th>
                                        {weekDates.map(d => (
                                            <th key={d} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-center min-w-[80px]">
                                                {new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}<br />
                                                <span className="text-[10px] font-normal">{new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {filteredStudents.map((student) => (
                                        <tr key={student.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-800 z-10">
                                                <div className="font-medium text-gray-900 dark:text-white text-sm">{student.firstName} {student.lastName}</div>
                                                <div className="text-xs text-gray-400 dark:text-gray-500">{student.admissionNumber}</div>
                                            </td>
                                            {weekDates.map(d => {
                                                const status = weeklyAttendance[student.id]?.[d];
                                                return (
                                                    <td key={d} className="px-4 py-3 text-center">
                                                        {status ? (
                                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                                                                status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                                                                    'bg-orange-100 text-orange-700'
                                                                }`}>
                                                                {status === 'PRESENT' ? 'P' : status === 'ABSENT' ? 'A' : 'L'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-300">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Floating Save Button */}
            {viewMode === 'daily' && (
                <div className="fixed bottom-6 right-6 z-10 print:hidden">
                    <button
                        onClick={handleSave}
                        disabled={saving || loading || students.length === 0}
                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        <Save size={20} />
                        {saving ? 'Saving...' : 'Save Attendance'}
                    </button>
                </div>
            )}

            {/* Reason Modal */}
            {showReasonModal && reasonStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:hidden">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Absence Reason</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {reasonStudent.firstName} {reasonStudent.lastName}
                        </p>
                        <textarea
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                            placeholder="e.g., Sick, Family emergency, Doctor's appointment..."
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
                            rows={3}
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => { setShowReasonModal(false); setReasonStudent(null); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveReason}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Save Reason
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceRegister;
