import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Calendar, Save, CheckCircle, XCircle, Clock, UserCheck,
    Search, BarChart2, Download, ChevronLeft, ChevronRight,
    MessageSquare, FileText, Printer, Undo2, AlertTriangle,
    Image, List, Volume2, Eye, Shield, Bell, Zap
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import AttendanceAnalytics from '../../components/academics/AttendanceAnalytics';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import * as XLSX from 'xlsx';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    profileImageUrl?: string;
}

interface AttendanceRecord {
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE';
    reason?: string;
    lateMinutes?: number;
    notes?: string;
}

interface UndoEntry {
    studentId: string;
    previousStatus: 'PRESENT' | 'ABSENT' | 'LATE';
    newStatus: 'PRESENT' | 'ABSENT' | 'LATE';
    timestamp: number;
}

type ViewMode = 'daily' | 'weekly' | 'analytics';

const AUTO_SAVE_KEY = 'attendance_draft';

const AttendanceRegister = () => {
    const { confirm, notify } = useAppDialog();
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
    const [displayMode, setDisplayMode] = useState<'list' | 'photo'>('list');

    // Weekly view state
    const [weekDates, setWeekDates] = useState<string[]>([]);
    const [weeklyAttendance, setWeeklyAttendance] = useState<Record<string, Record<string, 'PRESENT' | 'ABSENT' | 'LATE'>>>({});
    const [weeklyEditable, setWeeklyEditable] = useState(false);

    // Reason / Late modal
    const [showReasonModal, setShowReasonModal] = useState(false);
    const [reasonStudent, setReasonStudent] = useState<Student | null>(null);
    const [reasonText, setReasonText] = useState('');
    const [lateMinutes, setLateMinutes] = useState<number>(0);
    const [modalMode, setModalMode] = useState<'reason' | 'late'>('reason');

    // Undo stack
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

    // Sound feedback
    const [soundEnabled, setSoundEnabled] = useState(true);

    // Streak data (fetched from recent history)
    const [studentStreaks, setStudentStreaks] = useState<Record<string, { type: string; count: number }>>({});
    const [studentSparklines, setStudentSparklines] = useState<Record<string, number[]>>({});

    // Auto-save dirty flag
    const [isDirty, setIsDirty] = useState(false);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => { fetchClasses(); }, []);

    useEffect(() => {
        if (selectedClassId && date && viewMode === 'daily') {
            fetchAttendanceData();
        }
    }, [selectedClassId, date, viewMode]);

    useEffect(() => {
        if (selectedClassId && viewMode === 'weekly') {
            generateWeekDates();
        }
    }, [selectedClassId, date, viewMode]);

    useEffect(() => {
        if (selectedClassId && viewMode === 'weekly' && weekDates.length > 0) {
            fetchWeeklyData();
        }
    }, [weekDates]);

    // Auto-save draft to localStorage
    useEffect(() => {
        if (isDirty && selectedClassId && Object.keys(attendance).length > 0) {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = setTimeout(() => {
                const draft = { classId: selectedClassId, date, attendance, savedAt: Date.now() };
                localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(draft));
            }, 2000);
        }
        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    }, [attendance, isDirty]);

    // Fetch student streaks/sparklines when class loads
    useEffect(() => {
        if (selectedClassId && students.length > 0) {
            fetchStudentHistory();
        }
    }, [selectedClassId, students]);

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
            notify('Failed to load classes. Please try again.', 'error');
        }
    };

    const fetchStudentHistory = async () => {
        try {
            // Use analytics to get streak + sparkline data
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            const res = await api.get('/attendance/analytics', {
                params: {
                    classId: selectedClassId,
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                },
            });

            const summaries = res.data.studentSummaries || [];
            const streaks: Record<string, { type: string; count: number }> = {};
            const sparklines: Record<string, number[]> = {};

            summaries.forEach((s: any) => {
                streaks[s.studentId] = s.streak || { type: 'none', count: 0 };
                sparklines[s.studentId] = s.sparkline || [];
            });

            setStudentStreaks(streaks);
            setStudentSparklines(sparklines);
        } catch {
            // Silently fail — streaks are a nice-to-have
        }
    };

    const generateWeekDates = () => {
        const current = new Date(date);
        const dayOfWeek = current.getDay();
        const monday = new Date(current);
        monday.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        const dates: string[] = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }
        setWeekDates(dates);
    };

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            // Check for auto-saved draft
            const draftStr = localStorage.getItem(AUTO_SAVE_KEY);
            if (draftStr) {
                const draft = JSON.parse(draftStr);
                if (draft.classId === selectedClassId && draft.date === date && Date.now() - draft.savedAt < 3600000) {
                    const useDraft = await confirm({
                        title: 'Restore saved draft?',
                        message: 'We found unsaved attendance changes for this class and date. Would you like to restore them?',
                        confirmText: 'Restore draft',
                        cancelText: 'Discard',
                    });
                    if (useDraft) {
                        const classRes = await api.get(`/classes/${selectedClassId}`);
                        const classStudents = classRes.data.students || [];
                        classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
                        setStudents(classStudents);
                        setAttendance(draft.attendance);
                        setIsDirty(true);
                        setLoading(false);
                        return;
                    } else {
                        localStorage.removeItem(AUTO_SAVE_KEY);
                    }
                }
            }

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
                    lateMinutes: record?.lateMinutes || 0,
                    notes: record?.notes || '',
                };
            });
            setAttendance(initialAttendance);
            setIsDirty(false);
            setUndoStack([]);
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

    // Play a subtle feedback sound
    const playSound = useCallback((type: 'present' | 'absent' | 'late') => {
        if (!soundEnabled) return;
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.05;
            osc.frequency.value = type === 'present' ? 880 : type === 'late' ? 660 : 440;
            osc.type = 'sine';
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } catch {}
    }, [soundEnabled]);

    const handleStatusChange = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
        const prev = attendance[studentId]?.status;

        // Push to undo stack
        if (prev && prev !== status) {
            setUndoStack(stack => [...stack, { studentId, previousStatus: prev, newStatus: status, timestamp: Date.now() }]);
        }

        setAttendance(prev2 => ({
            ...prev2,
            [studentId]: { ...prev2[studentId], status }
        }));
        setIsDirty(true);
        playSound(status === 'PRESENT' ? 'present' : status === 'LATE' ? 'late' : 'absent');

        // Open modals
        if (status === 'ABSENT') {
            const student = students.find(s => s.id === studentId);
            if (student) {
                setReasonStudent(student);
                setReasonText(attendance[studentId]?.reason || '');
                setModalMode('reason');
                setShowReasonModal(true);
            }
        } else if (status === 'LATE') {
            const student = students.find(s => s.id === studentId);
            if (student) {
                setReasonStudent(student);
                setLateMinutes(attendance[studentId]?.lateMinutes || 15);
                setReasonText(attendance[studentId]?.reason || '');
                setModalMode('late');
                setShowReasonModal(true);
            }
        }
    };

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        setAttendance(prev => ({
            ...prev,
            [last.studentId]: { ...prev[last.studentId], status: last.previousStatus }
        }));
        setUndoStack(stack => stack.slice(0, -1));
        toast.success('Undone!', { duration: 1500, icon: '↩️' });
    };

    const handleSaveReason = () => {
        if (reasonStudent) {
            setAttendance(prev => ({
                ...prev,
                [reasonStudent.id]: {
                    ...prev[reasonStudent.id],
                    reason: reasonText,
                    lateMinutes: modalMode === 'late' ? lateMinutes : prev[reasonStudent.id]?.lateMinutes,
                }
            }));
        }
        setShowReasonModal(false);
        setReasonStudent(null);
        setReasonText('');
        setLateMinutes(0);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const records = Object.entries(attendance).map(([studentId, data]) => ({
                studentId,
                status: data.status,
                reason: data.reason || undefined,
                lateMinutes: data.status === 'LATE' ? (data.lateMinutes || undefined) : undefined,
                notes: data.notes || undefined,
            }));

            await api.post('/attendance', {
                classId: selectedClassId,
                date: new Date(date).toISOString(),
                records,
            });

            toast.success('Attendance saved successfully');
            localStorage.removeItem(AUTO_SAVE_KEY);
            setIsDirty(false);
            setUndoStack([]);
            // Refresh streaks
            fetchStudentHistory();
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
        setIsDirty(true);
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
        const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '0';
        return { total, present, absent, late, rate };
    }, [attendance, students]);

    const handleExportDaily = () => {
        const wsData: any[][] = [
            [`Daily Attendance: ${selectedClassName} - ${date}`],
            [],
            ['#', 'Admission No', 'Student Name', 'Status', 'Reason', 'Late (min)']
        ];
        filteredStudents.forEach((s, idx) => {
            const a = attendance[s.id];
            wsData.push([idx + 1, s.admissionNumber, `${s.firstName} ${s.lastName}`, a?.status || '-', a?.reason || '', a?.lateMinutes || '']);
        });
        wsData.push([], ['Summary'], ['Present', stats.present], ['Absent', stats.absent], ['Late', stats.late]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");
        XLSX.writeFile(wb, `Attendance_${selectedClassName}_${date}.xlsx`);
    };

    const changeDate = (delta: number) => {
        const d = new Date(date);
        d.setDate(d.getDate() + delta);
        setDate(d.toISOString().split('T')[0]);
    };

    // Sparkline SVG component
    const Sparkline = ({ data }: { data: number[] }) => {
        if (!data || data.length < 2) return null;
        const w = 60, h = 16;
        const step = w / (data.length - 1);
        const points = data.map((v, i) => `${i * step},${h - v * h}`).join(' ');
        return (
            <svg width={w} height={h} className="inline-block ml-2 opacity-70">
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500" />
            </svg>
        );
    };

    // Streak badge
    const StreakBadge = ({ streak }: { streak: { type: string; count: number } }) => {
        if (!streak || streak.count < 2) return null;
        if (streak.type === 'ABSENT') {
            return (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ml-2" title={`${streak.count}-day absence streak`}>
                    🔴 {streak.count}
                </span>
            );
        }
        if (streak.type === 'LATE') {
            return (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 ml-2" title={`${streak.count}-day late streak`}>
                    🟠 {streak.count}
                </span>
            );
        }
        if (streak.type === 'PRESENT' && streak.count >= 10) {
            return (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ml-2" title={`${streak.count}-day present streak!`}>
                    🟢 {streak.count}
                </span>
            );
        }
        return null;
    };

    // Touch/swipe handler
    const touchStartRef = useRef<Record<string, number>>({});

    const handleTouchStart = (studentId: string, e: React.TouchEvent) => {
        touchStartRef.current[studentId] = e.touches[0].clientX;
    };

    const handleTouchEnd = (studentId: string, e: React.TouchEvent) => {
        const startX = touchStartRef.current[studentId];
        if (startX === undefined) return;
        const endX = e.changedTouches[0].clientX;
        const diff = endX - startX;
        if (Math.abs(diff) > 60) {
            if (diff > 0) handleStatusChange(studentId, 'PRESENT');
            else handleStatusChange(studentId, 'ABSENT');
        }
        delete touchStartRef.current[studentId];
    };

    // Weekly view inline editing handler
    const handleWeeklyStatusChange = (studentId: string, dateStr: string) => {
        if (!weeklyEditable) return;
        setWeeklyAttendance(prev => {
            const studentData = { ...(prev[studentId] || {}) };
            const current = studentData[dateStr];
            const next = current === 'PRESENT' ? 'ABSENT' : current === 'ABSENT' ? 'LATE' : 'PRESENT';
            studentData[dateStr] = next;
            return { ...prev, [studentId]: studentData };
        });
    };

    const saveWeeklyDay = async (dateStr: string) => {
        try {
            const records = students.map(s => ({
                studentId: s.id,
                status: weeklyAttendance[s.id]?.[dateStr] || 'PRESENT',
            }));
            await api.post('/attendance', { classId: selectedClassId, date: new Date(dateStr).toISOString(), records });
            toast.success(`Saved attendance for ${dateStr}`);
        } catch {
            toast.error('Failed to save');
        }
    };

    if (viewMode === 'analytics') {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <AttendanceAnalytics classId={selectedClassId} className={selectedClassName} onBack={() => setViewMode('daily')} />
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
                        {(['daily', 'weekly', 'analytics'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === mode ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                                {mode === 'analytics' && <BarChart2 size={14} />}
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Display mode toggle (list vs photo) */}
                    {viewMode === 'daily' && (
                        <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1 print:hidden">
                            <button onClick={() => setDisplayMode('list')} className={`p-1.5 rounded ${displayMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`} title="List view">
                                <List size={16} className={displayMode === 'list' ? 'text-blue-600' : 'text-gray-400'} />
                            </button>
                            <button onClick={() => setDisplayMode('photo')} className={`p-1.5 rounded ${displayMode === 'photo' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`} title="Photo grid">
                                <Image size={16} className={displayMode === 'photo' ? 'text-blue-600' : 'text-gray-400'} />
                            </button>
                        </div>
                    )}

                    {/* Sound toggle */}
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`p-2 rounded-lg print:hidden ${soundEnabled ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 bg-gray-100 dark:bg-slate-700'}`}
                        title={soundEnabled ? 'Sound on' : 'Sound off'}
                    >
                        <Volume2 size={16} />
                    </button>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm mb-6 flex flex-wrap items-center gap-4">
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

                <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg p-1">
                    <button onClick={() => changeDate(-1)} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded transition-colors dark:text-gray-300">
                        <ChevronLeft size={16} />
                    </button>
                    <div className="relative">
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-transparent focus:outline-none w-36 dark:text-white" />
                    </div>
                    <button onClick={() => changeDate(1)} className="p-2 hover:bg-white dark:hover:bg-slate-600 rounded transition-colors dark:text-gray-300">
                        <ChevronRight size={16} />
                    </button>
                </div>

                <div className="relative flex-1 max-w-xs">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search student..."
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white dark:placeholder-gray-400" />
                </div>

                <div className="flex gap-2 ml-auto print:hidden">
                    {undoStack.length > 0 && (
                        <button onClick={handleUndo}
                            className="flex items-center gap-1 px-3 py-2 text-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 rounded-lg transition-colors text-sm font-medium"
                            title="Undo last change">
                            <Undo2 size={16} /> Undo
                        </button>
                    )}
                    <button onClick={handleExportDaily} className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Export to Excel">
                        <Download size={18} />
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors print:hidden" title="Print">
                        <Printer size={18} />
                    </button>
                </div>
            </div>

            {/* Auto-save indicator */}
            {isDirty && (
                <div className="mb-4 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 print:hidden">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                    Unsaved changes (auto-saving draft)
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 print:hidden">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-green-500">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1 flex items-center gap-1">
                        <CheckCircle size={14} /> Present
                    </div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.present}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-red-500">
                    <div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1 flex items-center gap-1">
                        <XCircle size={14} /> Absent
                    </div>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.absent}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-orange-500">
                    <div className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1 flex items-center gap-1">
                        <Clock size={14} /> Late
                    </div>
                    <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.late}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm border-l-4 border-l-blue-500">
                    <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1 flex items-center gap-1">
                        <Zap size={14} /> Rate
                    </div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.rate}%</div>
                </div>
            </div>

            {/* ═══════════ DAILY VIEW ═══════════ */}
            {viewMode === 'daily' && displayMode === 'list' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700/50 print:bg-white">
                        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Student Register</h2>
                        <div className="flex gap-2 print:hidden">
                            <button onClick={() => markAll('PRESENT')}
                                className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
                                Mark All Present
                            </button>
                            <button onClick={() => markAll('ABSENT')}
                                className="text-xs font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
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
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">#</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center print:hidden">Status</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden print:table-cell">Status</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider print:hidden">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {filteredStudents.map((student, index) => {
                                    const streak = studentStreaks[student.id];
                                    const sparkline = studentSparklines[student.id];
                                    const rec = attendance[student.id];

                                    return (
                                        <tr key={student.id}
                                            className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors"
                                            onTouchStart={(e) => handleTouchStart(student.id, e)}
                                            onTouchEnd={(e) => handleTouchEnd(student.id, e)}
                                        >
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{index + 1}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {student.profileImageUrl ? (
                                                        <img src={student.profileImageUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                                                            {student.firstName[0]}{student.lastName[0]}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-gray-900 dark:text-white flex items-center flex-wrap">
                                                            {student.firstName} {student.lastName}
                                                            {streak && <StreakBadge streak={streak} />}
                                                            {sparkline && <Sparkline data={sparkline} />}
                                                        </div>
                                                        <div className="text-xs text-gray-400 dark:text-gray-500">{student.admissionNumber}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 print:hidden">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {(['PRESENT', 'ABSENT', 'LATE'] as const).map(status => {
                                                        const isActive = rec?.status === status;
                                                        const colors = {
                                                            PRESENT: { active: 'bg-green-100 text-green-700 ring-2 ring-green-500 dark:bg-green-900/40 dark:text-green-400 dark:ring-green-600', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-400 dark:hover:bg-slate-600' },
                                                            ABSENT: { active: 'bg-red-100 text-red-700 ring-2 ring-red-500 dark:bg-red-900/40 dark:text-red-400 dark:ring-red-600', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-400 dark:hover:bg-slate-600' },
                                                            LATE: { active: 'bg-orange-100 text-orange-700 ring-2 ring-orange-500 dark:bg-orange-900/40 dark:text-orange-400 dark:ring-orange-600', inactive: 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-400 dark:hover:bg-slate-600' }
                                                        };
                                                        const icons = { PRESENT: CheckCircle, ABSENT: XCircle, LATE: Clock };
                                                        const Icon = icons[status];
                                                        // Accessibility: different patterns
                                                        const a11yLabel = { PRESENT: '✓ Present', ABSENT: '✗ Absent', LATE: '⏰ Late' };

                                                        return (
                                                            <button key={status}
                                                                onClick={() => handleStatusChange(student.id, status)}
                                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ring-offset-1 ${isActive ? colors[status].active : colors[status].inactive}`}
                                                                aria-label={a11yLabel[status]}
                                                            >
                                                                <Icon size={15} />
                                                                <span className="hidden sm:inline">{status.charAt(0) + status.slice(1).toLowerCase()}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 hidden print:table-cell text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${rec?.status === 'PRESENT' ? 'bg-green-100 text-green-700' : rec?.status === 'ABSENT' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {rec?.status || '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 print:hidden">
                                                <div className="flex flex-col gap-1">
                                                    {rec?.status === 'ABSENT' && (
                                                        <button onClick={() => { setReasonStudent(student); setReasonText(rec?.reason || ''); setModalMode('reason'); setShowReasonModal(true); }}
                                                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                                                            <MessageSquare size={12} />
                                                            {rec?.reason ? <span className="truncate max-w-[120px]">{rec.reason}</span> : 'Add reason'}
                                                        </button>
                                                    )}
                                                    {rec?.status === 'LATE' && (
                                                        <button onClick={() => { setReasonStudent(student); setLateMinutes(rec?.lateMinutes || 15); setReasonText(rec?.reason || ''); setModalMode('late'); setShowReasonModal(true); }}
                                                            className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700">
                                                            <Clock size={12} />
                                                            {rec?.lateMinutes ? `${rec.lateMinutes} min late` : 'Add time'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ═══════════ PHOTO GRID VIEW ═══════════ */}
            {viewMode === 'daily' && displayMode === 'photo' && (
                <div className="print:hidden">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Photo Grid — Tap to change status</h2>
                        <div className="flex gap-2">
                            <button onClick={() => markAll('PRESENT')} className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100">Mark All Present</button>
                            <button onClick={() => markAll('ABSENT')} className="text-xs font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100">Mark All Absent</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                        {filteredStudents.map(student => {
                            const rec = attendance[student.id];
                            const statusColors = { PRESENT: 'ring-green-500 bg-green-50 dark:bg-green-900/20', ABSENT: 'ring-red-500 bg-red-50 dark:bg-red-900/20', LATE: 'ring-orange-500 bg-orange-50 dark:bg-orange-900/20' };
                            const statusIcons = { PRESENT: CheckCircle, ABSENT: XCircle, LATE: Clock };
                            const StatusIcon = statusIcons[rec?.status || 'PRESENT'];
                            const nextStatus = rec?.status === 'PRESENT' ? 'ABSENT' : rec?.status === 'ABSENT' ? 'LATE' : 'PRESENT';

                            return (
                                <button key={student.id}
                                    onClick={() => handleStatusChange(student.id, nextStatus)}
                                    className={`flex flex-col items-center p-3 rounded-xl border-2 ring-2 transition-all hover:shadow-md ${statusColors[rec?.status || 'PRESENT']} dark:border-slate-600`}
                                >
                                    {student.profileImageUrl ? (
                                        <img src={student.profileImageUrl} alt="" className="w-14 h-14 rounded-full object-cover mb-2" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg mb-2">
                                            {student.firstName[0]}{student.lastName[0]}
                                        </div>
                                    )}
                                    <div className="text-xs font-medium text-gray-900 dark:text-white text-center truncate w-full">{student.firstName}</div>
                                    <div className="text-[10px] text-gray-400 truncate w-full text-center">{student.lastName}</div>
                                    <StatusIcon size={18} className={`mt-1 ${rec?.status === 'PRESENT' ? 'text-green-600' : rec?.status === 'ABSENT' ? 'text-red-600' : 'text-orange-600'}`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══════════ WEEKLY VIEW ═══════════ */}
            {viewMode === 'weekly' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 flex justify-between items-center">
                        <div>
                            <h2 className="font-semibold text-gray-700 dark:text-gray-200">Weekly View</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Week of {weekDates[0] ? new Date(weekDates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} -
                                {weekDates[4] ? new Date(weekDates[4]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                            </p>
                        </div>
                        <button onClick={() => setWeeklyEditable(!weeklyEditable)}
                            className={`text-sm px-3 py-1.5 rounded-lg font-medium print:hidden ${weeklyEditable ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-400'}`}>
                            {weeklyEditable ? '✏️ Editing' : '👁️ View Only'}
                        </button>
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
                                    {filteredStudents.map(student => (
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
                                                            <button
                                                                onClick={() => handleWeeklyStatusChange(student.id, d)}
                                                                disabled={!weeklyEditable}
                                                                className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${weeklyEditable ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${status === 'PRESENT' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : status === 'ABSENT' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'}`}
                                                            >
                                                                {status === 'PRESENT' ? 'P' : status === 'ABSENT' ? 'A' : 'L'}
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-300 dark:text-gray-600">-</span>
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

                    {weeklyEditable && (
                        <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 flex gap-2 print:hidden">
                            {weekDates.map(d => (
                                <button key={d} onClick={() => saveWeeklyDay(d)}
                                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    Save {new Date(d).toLocaleDateString(undefined, { weekday: 'short' })}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Floating Save Button */}
            {viewMode === 'daily' && (
                <div className="fixed bottom-6 right-6 z-10 print:hidden flex items-center gap-3">
                    {isDirty && <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">Unsaved</span>}
                    <button onClick={handleSave} disabled={saving || loading || students.length === 0}
                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium">
                        <Save size={20} />
                        {saving ? 'Saving...' : 'Save Attendance'}
                    </button>
                </div>
            )}

            {/* ═══════════ REASON / LATE MODAL ═══════════ */}
            {showReasonModal && reasonStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:hidden">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                            {modalMode === 'late' ? '⏰ Late Arrival Details' : '📝 Absence Reason'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            {reasonStudent.firstName} {reasonStudent.lastName}
                        </p>

                        {modalMode === 'late' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Minutes Late</label>
                                <div className="flex items-center gap-3">
                                    {[5, 10, 15, 30, 45, 60].map(mins => (
                                        <button key={mins} onClick={() => setLateMinutes(mins)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${lateMinutes === mins ? 'bg-orange-100 text-orange-700 ring-2 ring-orange-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300'}`}>
                                            {mins}m
                                        </button>
                                    ))}
                                </div>
                                <input type="number" value={lateMinutes} onChange={(e) => setLateMinutes(parseInt(e.target.value) || 0)} min={1} max={240}
                                    className="mt-2 w-24 px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white dark:bg-slate-700 dark:text-white" />
                            </div>
                        )}

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {modalMode === 'late' ? 'Reason (optional)' : 'Reason'}
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {(modalMode === 'reason'
                                ? ['Sick', 'Family emergency', 'Doctor appointment', 'Transport issue', 'Funeral', 'Other']
                                : ['Traffic', 'Overslept', 'Transport issue', 'Doctor visit', 'Other']
                            ).map(r => (
                                <button key={r} onClick={() => setReasonText(r)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${reasonText === r ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300'}`}>
                                    {r}
                                </button>
                            ))}
                        </div>
                        <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)}
                            placeholder={modalMode === 'late' ? 'Optional reason...' : 'e.g., Sick, Family emergency...'}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
                            rows={2} />

                        <div className="flex justify-end gap-3 mt-4">
                            <button onClick={() => { setShowReasonModal(false); setReasonStudent(null); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                                Cancel
                            </button>
                            <button onClick={handleSaveReason}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceRegister;
