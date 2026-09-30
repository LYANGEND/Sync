import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Calendar, Save, CheckCircle, XCircle, Clock, UserCheck,
    Search, BarChart2, Download, ChevronLeft, ChevronRight,
    MessageSquare, Printer, Undo2, AlertTriangle, LayoutGrid,
    List, Volume2, VolumeX, Eye, Shield, Zap, Users, Pencil,
    X, Loader2, RefreshCw
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
    const [classesLoading, setClassesLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
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
        setClassesLoading(true);
        setLoadError(null);
        try {
            const response = await api.get('/classes');
            const nextClasses = Array.isArray(response.data) ? response.data : [];
            setClasses(nextClasses);
            if (nextClasses.length > 0) {
                setSelectedClassId(nextClasses[0].id);
                setSelectedClassName(nextClasses[0].name);
            }
        } catch (error) {
            console.error('Error fetching classes:', error);
            setLoadError('Classes could not be loaded. Check your connection and try again.');
            notify('Failed to load classes. Please try again.', 'error');
        } finally {
            setClassesLoading(false);
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
        setLoadError(null);
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
            setLoadError('The attendance register could not be loaded for this class and date.');
            toast.error('Failed to load class list');
        } finally {
            setLoading(false);
        }
    };

    const fetchWeeklyData = async () => {
        setLoading(true);
        setLoadError(null);
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
            setLoadError('The weekly attendance register could not be loaded.');
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
        toast.success('Last attendance change undone', { duration: 1500 });
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
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300" title={`${streak.count}-day absence streak`}>
                    <AlertTriangle size={10} aria-hidden="true" /> {streak.count} days
                </span>
            );
        }
        if (streak.type === 'LATE') {
            return (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" title={`${streak.count}-day late streak`}>
                    <Clock size={10} aria-hidden="true" /> {streak.count} days
                </span>
            );
        }
        if (streak.type === 'PRESENT' && streak.count >= 10) {
            return (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title={`${streak.count}-day present streak`}>
                    <Zap size={10} aria-hidden="true" /> {streak.count} days
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

    const statusOptions = [
        {
            value: 'PRESENT' as const,
            label: 'Present',
            icon: CheckCircle,
            active: 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300',
        },
        {
            value: 'ABSENT' as const,
            label: 'Absent',
            icon: XCircle,
            active: 'border-red-500 bg-red-50 text-red-700 shadow-sm dark:border-red-500 dark:bg-red-950/60 dark:text-red-300',
        },
        {
            value: 'LATE' as const,
            label: 'Late',
            icon: Clock,
            active: 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm dark:border-orange-500 dark:bg-orange-950/60 dark:text-orange-300',
        },
    ];

    const renderStatusSelector = (student: Student, record?: AttendanceRecord, fill = false) => (
        <div className={`grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-900 ${fill ? 'w-full' : 'min-w-[278px]'}`}>
            {statusOptions.map(({ value, label, icon: Icon, active }) => {
                const isActive = record?.status === value;
                return (
                    <button
                        key={value}
                        type="button"
                        onClick={() => handleStatusChange(student.id, value)}
                        aria-label={`Mark ${student.firstName} ${label.toLowerCase()}`}
                        aria-pressed={isActive}
                        className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${isActive ? active : 'border-transparent bg-transparent text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    >
                        <Icon size={16} aria-hidden="true" />
                        <span>{label}</span>
                    </button>
                );
            })}
        </div>
    );

    const selectedDateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
    const attendanceRate = Number(stats.rate);
    const retryCurrentView = () => {
        if (!selectedClassId) {
            fetchClasses();
        } else if (viewMode === 'weekly') {
            fetchWeeklyData();
        } else {
            fetchAttendanceData();
        }
    };

    if (viewMode === 'analytics') {
        return (
            <div className="mx-auto max-w-7xl bg-slate-50/70 p-4 dark:bg-slate-950/20 md:p-6">
                <AttendanceAnalytics classId={selectedClassId} className={selectedClassName} onBack={() => setViewMode('daily')} />
            </div>
        );
    }

    return (
        <div className="printable-content min-w-0 bg-slate-50/70 pb-8 dark:bg-slate-950/20 print:bg-white print:p-0">
            {/* Workspace header */}
            <section className="relative overflow-hidden bg-gradient-to-br from-[#003366] via-[#0047AB] to-[#0967c8] px-4 py-6 text-white print:bg-white print:text-slate-950 sm:px-6 md:px-8 md:py-8">
                <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl print:hidden" />
                <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#FF9933]/20 blur-3xl print:hidden" />

                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-50 backdrop-blur-sm print:hidden">
                            <Shield size={14} aria-hidden="true" /> Academic operations
                        </div>
                        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20 print:hidden">
                                <UserCheck size={24} aria-hidden="true" />
                            </span>
                            Class Attendance
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100 sm:text-base print:text-slate-600">
                            Record the daily register, follow attendance patterns, and keep every learner accounted for.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-blue-50 print:text-slate-700">
                            <span className="inline-flex items-center gap-2"><Calendar size={16} aria-hidden="true" /> {selectedDateLabel}</span>
                            <span className="inline-flex items-center gap-2"><Users size={16} aria-hidden="true" /> {selectedClassName || 'Select a class'}</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 print:hidden">
                        <div className="inline-flex w-full rounded-xl border border-white/15 bg-[#002b57]/50 p-1 backdrop-blur-sm sm:w-auto" role="tablist" aria-label="Attendance views">
                            {([
                                { value: 'daily' as const, label: 'Daily', icon: UserCheck },
                                { value: 'weekly' as const, label: 'Weekly', icon: Calendar },
                                { value: 'analytics' as const, label: 'Analytics', icon: BarChart2 },
                            ]).map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={viewMode === value}
                                    onClick={() => setViewMode(value)}
                                    className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${viewMode === value ? 'bg-white text-[#003366] shadow-sm' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}
                                >
                                    <Icon size={16} aria-hidden="true" /> {label}
                                </button>
                            ))}
                        </div>

                        {viewMode === 'daily' && (
                            <div className="flex items-center justify-end gap-2">
                                <div className="inline-flex rounded-lg border border-white/15 bg-[#002b57]/50 p-1" aria-label="Register layout">
                                    <button type="button" onClick={() => setDisplayMode('list')} aria-label="Use list view" aria-pressed={displayMode === 'list'} className={`grid h-10 w-10 cursor-pointer place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${displayMode === 'list' ? 'bg-white text-[#0047AB]' : 'text-blue-100 hover:bg-white/10'}`}>
                                        <List size={18} aria-hidden="true" />
                                    </button>
                                    <button type="button" onClick={() => setDisplayMode('photo')} aria-label="Use photo grid" aria-pressed={displayMode === 'photo'} className={`grid h-10 w-10 cursor-pointer place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${displayMode === 'photo' ? 'bg-white text-[#0047AB]' : 'text-blue-100 hover:bg-white/10'}`}>
                                        <LayoutGrid size={18} aria-hidden="true" />
                                    </button>
                                </div>
                                <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} aria-label={soundEnabled ? 'Turn sound feedback off' : 'Turn sound feedback on'} aria-pressed={soundEnabled} className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg border border-white/15 bg-[#002b57]/50 text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                                    {soundEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <div className="space-y-5 p-4 sm:p-6 md:p-8">
                {/* Register filters and utility actions */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5 print:border-0 print:p-0 print:shadow-none" aria-labelledby="register-setup-title">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
                        <div>
                            <h2 id="register-setup-title" className="text-base font-bold text-slate-900 dark:text-white">Register setup</h2>
                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Choose a class and date before marking attendance.</p>
                        </div>
                        <div className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold ${isDirty ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`} aria-live="polite">
                            <span className={`h-2 w-2 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {isDirty ? 'Draft saved locally' : 'Register up to date'}
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-12">
                        <div className="lg:col-span-3">
                            <label htmlFor="attendance-class" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Class</label>
                            <div className="relative">
                                <Users size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <select
                                    id="attendance-class"
                                    value={selectedClassId}
                                    disabled={classesLoading || classes.length === 0}
                                    onChange={(e) => {
                                        setSelectedClassId(e.target.value);
                                        setSelectedClassName(classes.find(c => c.id === e.target.value)?.name || '');
                                    }}
                                    className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-300 bg-white pl-10 pr-9 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-[#0047AB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                                >
                                    {classes.length === 0 && <option value="">{classesLoading ? 'Loading classes…' : 'No classes available'}</option>}
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                {classesLoading && <Loader2 size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#0047AB] motion-reduce:animate-none" aria-hidden="true" />}
                            </div>
                        </div>

                        <div className="lg:col-span-4">
                            <label htmlFor="attendance-date" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Register date</label>
                            <div className="flex h-11 items-center rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
                                <button type="button" onClick={() => changeDate(-1)} className="grid h-full w-11 shrink-0 cursor-pointer place-items-center rounded-l-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-400 dark:hover:bg-slate-700" aria-label="Previous day">
                                    <ChevronLeft size={18} aria-hidden="true" />
                                </button>
                                <div className="relative min-w-0 flex-1 border-x border-slate-200 dark:border-slate-700">
                                    <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-[42px] w-full min-w-0 bg-transparent pl-9 pr-2 text-sm font-medium text-slate-800 outline-none dark:text-white" />
                                </div>
                                <button type="button" onClick={() => changeDate(1)} className="grid h-full w-11 shrink-0 cursor-pointer place-items-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-400 dark:hover:bg-slate-700" aria-label="Next day">
                                    <ChevronRight size={18} aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <label htmlFor="attendance-search" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Find a student</label>
                            <div className="relative">
                                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <input id="attendance-search" type="search" placeholder="Name or admission number" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#0047AB] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950" />
                            </div>
                        </div>

                        <div className="flex items-end gap-2 lg:col-span-2 print:hidden">
                            {undoStack.length > 0 && (
                                <button type="button" onClick={handleUndo} className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300" title="Undo last change">
                                    <Undo2 size={17} aria-hidden="true" /><span className="sr-only xl:not-sr-only">Undo</span>
                                </button>
                            )}
                            {viewMode === 'daily' && (
                                <button type="button" onClick={handleExportDaily} disabled={students.length === 0} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-300 text-slate-600 transition-colors hover:border-[#0047AB] hover:bg-blue-50 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-blue-950/40" title="Export register to Excel" aria-label="Export register to Excel">
                                    <Download size={18} aria-hidden="true" />
                                </button>
                            )}
                            <button type="button" onClick={() => window.print()} className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-300 text-slate-600 transition-colors hover:border-[#0047AB] hover:bg-blue-50 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:text-slate-300 dark:hover:bg-blue-950/40" title="Print register" aria-label="Print register">
                                <Printer size={18} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Live daily summary */}
                {viewMode === 'daily' && (
                    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6 print:hidden" aria-label="Attendance summary">
                        <div className="col-span-2 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm dark:border-blue-900 dark:from-blue-950/70 dark:to-slate-800 xl:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0047AB] dark:text-blue-300">Attendance rate</p>
                                    <p className="mt-1 text-3xl font-bold tracking-tight text-[#003366] dark:text-white">{stats.rate}%</p>
                                </div>
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0047AB] text-white shadow-sm"><Zap size={19} aria-hidden="true" /></span>
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-slate-700">
                                <div className="h-full rounded-full bg-gradient-to-r from-[#0047AB] to-emerald-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(attendanceRate, 100)}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{stats.present} of {stats.total} learners marked present</p>
                        </div>

                        {[
                            { label: 'Learners', value: stats.total, icon: Users, color: 'text-slate-700 dark:text-slate-200', iconStyle: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
                            { label: 'Present', value: stats.present, icon: CheckCircle, color: 'text-emerald-700 dark:text-emerald-300', iconStyle: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300' },
                            { label: 'Absent', value: stats.absent, icon: XCircle, color: 'text-red-700 dark:text-red-300', iconStyle: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300' },
                            { label: 'Late', value: stats.late, icon: Clock, color: 'text-orange-700 dark:text-orange-300', iconStyle: 'bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300' },
                        ].map(({ label, value, icon: Icon, color, iconStyle }) => (
                            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconStyle}`}><Icon size={17} aria-hidden="true" /></span>
                                <p className={`mt-3 text-2xl font-bold ${color}`}>{value}</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                            </div>
                        ))}
                    </section>
                )}

                {/* Daily register */}
                {viewMode === 'daily' && displayMode === 'list' && (
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="student-register-title">
                        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-5 print:bg-white">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 id="student-register-title" className="font-bold text-slate-900 dark:text-white">Student register</h2>
                                    {!loading && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-[#0047AB] dark:bg-blue-950/70 dark:text-blue-300">{filteredStudents.length}</span>}
                                </div>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    Select a status for each learner. On touch screens, swipe right for present or left for absent.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 print:hidden">
                                <button type="button" onClick={() => markAll('PRESENT')} disabled={loading || filteredStudents.length === 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <CheckCircle size={16} aria-hidden="true" /> Mark all present
                                </button>
                                <button type="button" onClick={() => markAll('ABSENT')} disabled={loading || filteredStudents.length === 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                                    <XCircle size={16} aria-hidden="true" /> Mark all absent
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="status">
                                <div>
                                    <Loader2 className="mx-auto animate-spin text-[#0047AB] motion-reduce:animate-none" size={32} aria-hidden="true" />
                                    <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Loading the register</p>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Getting learners and saved attendance…</p>
                                </div>
                            </div>
                        ) : loadError ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="alert">
                                <div className="max-w-sm">
                                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300"><AlertTriangle size={22} aria-hidden="true" /></span>
                                    <h3 className="mt-3 font-bold text-slate-900 dark:text-white">Unable to open this register</h3>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{loadError}</p>
                                    <button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#003b8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2">
                                        <RefreshCw size={16} aria-hidden="true" /> Try again
                                    </button>
                                </div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center">
                                <div className="max-w-sm">
                                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0047AB] dark:bg-blue-950/60 dark:text-blue-300">{searchQuery ? <Search size={22} aria-hidden="true" /> : <Users size={22} aria-hidden="true" />}</span>
                                    <h3 className="mt-3 font-bold text-slate-900 dark:text-white">{searchQuery ? 'No matching learners' : 'No learners in this class'}</h3>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{searchQuery ? `No learner matches “${searchQuery}”. Try another name or admission number.` : 'Add learners to this class before taking attendance.'}</p>
                                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="mt-4 min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Clear search</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Mobile register cards */}
                                <div className="divide-y divide-slate-200 dark:divide-slate-700 md:hidden print:hidden">
                                    {filteredStudents.map((student, index) => {
                                        const rec = attendance[student.id];
                                        const streak = studentStreaks[student.id];
                                        return (
                                            <article key={student.id} className="p-4" onTouchStart={(e) => handleTouchStart(student.id, e)} onTouchEnd={(e) => handleTouchEnd(student.id, e)}>
                                                <div className="mb-3 flex min-w-0 items-center gap-3">
                                                    <span className="w-5 shrink-0 text-xs font-bold text-slate-400">{index + 1}</span>
                                                    {student.profileImageUrl ? (
                                                        <img src={student.profileImageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-600" />
                                                    ) : (
                                                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0047AB] to-[#003366] text-sm font-bold text-white shadow-sm">{student.firstName[0]}{student.lastName[0]}</div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center">
                                                            <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{student.firstName} {student.lastName}</h3>
                                                            {streak && <StreakBadge streak={streak} />}
                                                        </div>
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{student.admissionNumber}</p>
                                                    </div>
                                                </div>
                                                {renderStatusSelector(student, rec, true)}
                                                {rec?.status === 'ABSENT' && (
                                                    <button type="button" onClick={() => { setReasonStudent(student); setReasonText(rec.reason || ''); setModalMode('reason'); setShowReasonModal(true); }} className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-300 dark:hover:bg-blue-950/40">
                                                        <MessageSquare size={14} aria-hidden="true" /> {rec.reason || 'Add absence reason'}
                                                    </button>
                                                )}
                                                {rec?.status === 'LATE' && (
                                                    <button type="button" onClick={() => { setReasonStudent(student); setLateMinutes(rec.lateMinutes || 15); setReasonText(rec.reason || ''); setModalMode('late'); setShowReasonModal(true); }} className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-300 dark:hover:bg-orange-950/40">
                                                        <Clock size={14} aria-hidden="true" /> {rec.lateMinutes ? `${rec.lateMinutes} minutes late` : 'Add late arrival details'}
                                                    </button>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>

                                {/* Desktop and print register table */}
                                <div className="hidden overflow-x-auto md:block print:block">
                                    <table className="w-full text-left">
                                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 print:bg-white">
                                            <tr>
                                                <th className="w-14 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">#</th>
                                                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Learner</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 print:hidden">Attendance status</th>
                                                <th className="hidden px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500 print:table-cell">Status</th>
                                                <th className="w-40 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 print:hidden">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {filteredStudents.map((student, index) => {
                                                const streak = studentStreaks[student.id];
                                                const sparkline = studentSparklines[student.id];
                                                const rec = attendance[student.id];
                                                return (
                                                    <tr key={student.id} className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-700/40">
                                                        <td className="px-5 py-3 text-sm font-medium text-slate-400">{index + 1}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                {student.profileImageUrl ? (
                                                                    <img src={student.profileImageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-600" />
                                                                ) : (
                                                                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0047AB] to-[#003366] text-sm font-bold text-white shadow-sm">{student.firstName[0]}{student.lastName[0]}</div>
                                                                )}
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center text-sm font-bold text-slate-900 dark:text-white">
                                                                        {student.firstName} {student.lastName}
                                                                        {streak && <StreakBadge streak={streak} />}
                                                                        {sparkline && <Sparkline data={sparkline} />}
                                                                    </div>
                                                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{student.admissionNumber}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 print:hidden">{renderStatusSelector(student, rec)}</td>
                                                        <td className="hidden px-4 py-3 text-center print:table-cell">
                                                            <span className={`rounded px-2 py-1 text-xs font-bold ${rec?.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : rec?.status === 'ABSENT' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{rec?.status || '—'}</span>
                                                        </td>
                                                        <td className="px-5 py-3 print:hidden">
                                                            {rec?.status === 'ABSENT' && (
                                                                <button type="button" onClick={() => { setReasonStudent(student); setReasonText(rec.reason || ''); setModalMode('reason'); setShowReasonModal(true); }} className="inline-flex min-h-9 max-w-36 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:bg-blue-50 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-300 dark:hover:bg-blue-950/40">
                                                                    <MessageSquare size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{rec.reason || 'Add reason'}</span>
                                                                </button>
                                                            )}
                                                            {rec?.status === 'LATE' && (
                                                                <button type="button" onClick={() => { setReasonStudent(student); setLateMinutes(rec.lateMinutes || 15); setReasonText(rec.reason || ''); setModalMode('late'); setShowReasonModal(true); }} className="inline-flex min-h-9 max-w-36 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-300 dark:hover:bg-orange-950/40">
                                                                    <Clock size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{rec.lateMinutes ? `${rec.lateMinutes} min late` : 'Add time'}</span>
                                                                </button>
                                                            )}
                                                            {rec?.status === 'PRESENT' && <span className="text-xs font-medium text-slate-400">No details needed</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </section>
                )}

                {/* Photo register */}
                {viewMode === 'daily' && displayMode === 'photo' && (
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 print:hidden" aria-labelledby="photo-register-title">
                        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                            <div>
                                <h2 id="photo-register-title" className="font-bold text-slate-900 dark:text-white">Photo register</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tap a learner card to cycle through present, absent, and late.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => markAll('PRESENT')} disabled={loading || filteredStudents.length === 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <CheckCircle size={16} aria-hidden="true" /> All present
                                </button>
                                <button type="button" onClick={() => markAll('ABSENT')} disabled={loading || filteredStudents.length === 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                                    <XCircle size={16} aria-hidden="true" /> All absent
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="status">
                                <div><Loader2 className="mx-auto animate-spin text-[#0047AB] motion-reduce:animate-none" size={32} aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Loading learner photos</p></div>
                            </div>
                        ) : loadError ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="alert">
                                <div className="max-w-sm"><AlertTriangle className="mx-auto text-red-500" size={30} aria-hidden="true" /><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{loadError}</p><button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white hover:bg-[#003b8f]"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center">
                                <div><Users className="mx-auto text-slate-400" size={30} aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{searchQuery ? 'No matching learners' : 'No learners in this class'}</p>{searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="mt-3 min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Clear search</button>}</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:p-5">
                                {filteredStudents.map(student => {
                                    const rec = attendance[student.id];
                                    const currentStatus = rec?.status || 'PRESENT';
                                    const nextStatus = currentStatus === 'PRESENT' ? 'ABSENT' : currentStatus === 'ABSENT' ? 'LATE' : 'PRESENT';
                                    const config = statusOptions.find(option => option.value === currentStatus) || statusOptions[0];
                                    const StatusIcon = config.icon;
                                    const cardStyle = currentStatus === 'PRESENT'
                                        ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                                        : currentStatus === 'ABSENT'
                                            ? 'border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30'
                                            : 'border-orange-300 bg-orange-50/60 dark:border-orange-800 dark:bg-orange-950/30';
                                    const statusStyle = currentStatus === 'PRESENT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : currentStatus === 'ABSENT' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
                                    return (
                                        <button key={student.id} type="button" onClick={() => handleStatusChange(student.id, nextStatus)} aria-label={`${student.firstName} ${student.lastName} is ${config.label.toLowerCase()}. Change status.`} className={`group min-h-48 cursor-pointer rounded-2xl border p-4 text-center transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none dark:focus-visible:ring-offset-slate-800 ${cardStyle}`}>
                                            <div className="relative mx-auto w-fit">
                                                {student.profileImageUrl ? (
                                                    <img src={student.profileImageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-sm ring-2 ring-white dark:ring-slate-700" />
                                                ) : (
                                                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#0047AB] to-[#003366] text-lg font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-700">{student.firstName[0]}{student.lastName[0]}</div>
                                                )}
                                                <span className={`absolute -bottom-2 -right-2 grid h-7 w-7 place-items-center rounded-full ring-2 ring-white dark:ring-slate-800 ${statusStyle}`}><StatusIcon size={15} aria-hidden="true" /></span>
                                            </div>
                                            <p className="mt-4 truncate text-sm font-bold text-slate-900 dark:text-white">{student.firstName}</p>
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{student.lastName}</p>
                                            <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle}`}>{config.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* Weekly register */}
                {viewMode === 'weekly' && (
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800" aria-labelledby="weekly-register-title">
                        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                            <div>
                                <h2 id="weekly-register-title" className="font-bold text-slate-900 dark:text-white">Weekly overview</h2>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                    {weekDates[0] && weekDates[4]
                                        ? `${new Date(`${weekDates[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${weekDates[4]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                                        : 'Preparing the selected week…'}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 print:hidden">
                                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400" aria-label="Status legend">
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Present</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Absent</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Late</span>
                                </div>
                                <button type="button" onClick={() => setWeeklyEditable(!weeklyEditable)} aria-pressed={weeklyEditable} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${weeklyEditable ? 'border-blue-300 bg-blue-50 text-[#0047AB] dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700'}`}>
                                    {weeklyEditable ? <Pencil size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                                    {weeklyEditable ? 'Editing enabled' : 'View only'}
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="status">
                                <div><Loader2 className="mx-auto animate-spin text-[#0047AB] motion-reduce:animate-none" size={32} aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">Loading the week</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Combining attendance from Monday to Friday…</p></div>
                            </div>
                        ) : loadError ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center" role="alert">
                                <div className="max-w-sm"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300"><AlertTriangle size={22} aria-hidden="true" /></span><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{loadError}</p><button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white hover:bg-[#003b8f]"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="grid min-h-64 place-items-center p-8 text-center"><div><Users className="mx-auto text-slate-400" size={30} aria-hidden="true" /><p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{searchQuery ? 'No matching learners' : 'No learners in this class'}</p>{searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="mt-3 min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Clear search</button>}</div></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-left">
                                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="sticky left-0 z-10 min-w-52 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">Learner</th>
                                            {weekDates.map(d => (
                                                <th key={d} className="min-w-24 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                    {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}<br />
                                                    <span className="text-[10px] font-medium normal-case tracking-normal">{new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredStudents.map(student => (
                                            <tr key={student.id} className="transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-700/40">
                                                <td className="sticky left-0 z-10 bg-white px-5 py-3 dark:bg-slate-800">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white">{student.firstName} {student.lastName}</div>
                                                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{student.admissionNumber}</div>
                                                </td>
                                                {weekDates.map(d => {
                                                    const status = weeklyAttendance[student.id]?.[d];
                                                    const statusLabel = status === 'PRESENT' ? 'Present' : status === 'ABSENT' ? 'Absent' : status === 'LATE' ? 'Late' : 'Not recorded';
                                                    return (
                                                        <td key={d} className="px-3 py-3 text-center">
                                                            {status ? (
                                                                <button type="button" onClick={() => handleWeeklyStatusChange(student.id, d)} disabled={!weeklyEditable} aria-label={`${student.firstName}, ${statusLabel} on ${new Date(`${d}T00:00:00`).toLocaleDateString()}`} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition-[background-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] motion-reduce:transform-none ${weeklyEditable ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : status === 'ABSENT' ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300'}`}>
                                                                    {status === 'PRESENT' ? 'P' : status === 'ABSENT' ? 'A' : 'L'}
                                                                </button>
                                                            ) : weeklyEditable ? (
                                                                <button type="button" onClick={() => handleWeeklyStatusChange(student.id, d)} aria-label={`Start attendance for ${student.firstName} on ${new Date(`${d}T00:00:00`).toLocaleDateString()}`} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-bold text-slate-400 transition-colors hover:border-[#0047AB] hover:bg-blue-50 hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:hover:bg-blue-950/40">+</button>
                                                            ) : <span className="text-slate-300 dark:text-slate-600" aria-label="Not recorded">—</span>}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {weeklyEditable && !loading && !loadError && students.length > 0 && (
                            <div className="border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40 print:hidden">
                                <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Save changes for each school day</p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                    {weekDates.map(d => (
                                        <button key={d} type="button" onClick={() => saveWeeklyDay(d)} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-3 text-xs font-bold text-white transition-colors hover:bg-[#003b8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2">
                                            <Save size={15} aria-hidden="true" /> {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* Stable daily save bar */}
                {viewMode === 'daily' && (
                    <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/95 sm:flex-row sm:items-center sm:justify-between sm:p-4 print:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isDirty ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
                                {isDirty ? <AlertTriangle size={18} aria-hidden="true" /> : <Shield size={18} aria-hidden="true" />}
                            </span>
                            <div className="min-w-0" aria-live="polite">
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{isDirty ? 'Attendance changes are ready to save' : 'Attendance is saved'}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{isDirty ? 'A local draft is kept while you work.' : `${selectedClassName || 'Selected class'} · ${selectedDateLabel}`}</p>
                            </div>
                        </div>
                        <button type="button" onClick={handleSave} disabled={saving || loading || students.length === 0} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#003b8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-800 sm:w-auto">
                            {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                            {saving ? 'Saving attendance…' : 'Save attendance'}
                        </button>
                    </div>
                )}
            </div>

            {/* Absence and late-arrival details */}
            {showReasonModal && reasonStudent && (
                <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm print:hidden" role="presentation">
                    <div className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800" role="dialog" aria-modal="true" aria-labelledby="attendance-details-title">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${modalMode === 'late' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300' : 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'}`}>
                                    {modalMode === 'late' ? <Clock size={20} aria-hidden="true" /> : <MessageSquare size={20} aria-hidden="true" />}
                                </span>
                                <div className="min-w-0">
                                    <h3 id="attendance-details-title" className="text-lg font-bold text-slate-900 dark:text-white">{modalMode === 'late' ? 'Late arrival details' : 'Absence reason'}</h3>
                                    <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{reasonStudent.firstName} {reasonStudent.lastName} · {reasonStudent.admissionNumber}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => { setShowReasonModal(false); setReasonStudent(null); }} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Close attendance details">
                                <X size={19} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="space-y-5 p-5 sm:p-6">
                            {modalMode === 'late' && (
                                <fieldset>
                                    <legend className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">How many minutes late?</legend>
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                        {[5, 10, 15, 30, 45, 60].map(mins => (
                                            <button key={mins} type="button" onClick={() => setLateMinutes(mins)} aria-pressed={lateMinutes === mins} className={`min-h-11 cursor-pointer rounded-xl border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${lateMinutes === mins ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                                                {mins}m
                                            </button>
                                        ))}
                                    </div>
                                    <label htmlFor="custom-late-minutes" className="mt-3 block text-xs font-semibold text-slate-500 dark:text-slate-400">Custom minutes</label>
                                    <input id="custom-late-minutes" type="number" value={lateMinutes} onChange={(e) => setLateMinutes(parseInt(e.target.value) || 0)} min={1} max={240} className="mt-1.5 h-11 w-32 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:ring-orange-950" />
                                </fieldset>
                            )}

                            <div>
                                <label htmlFor="attendance-reason" className="block text-sm font-bold text-slate-800 dark:text-slate-200">{modalMode === 'late' ? 'Reason (optional)' : 'Reason for absence'}</label>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Choose a common reason or enter a more specific note.</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(modalMode === 'reason'
                                        ? ['Sick', 'Family emergency', 'Doctor appointment', 'Transport issue', 'Funeral', 'Other']
                                        : ['Traffic', 'Overslept', 'Transport issue', 'Doctor visit', 'Other']
                                    ).map(reason => (
                                        <button key={reason} type="button" onClick={() => setReasonText(reason)} aria-pressed={reasonText === reason} className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${reasonText === reason ? 'border-blue-400 bg-blue-50 text-[#0047AB] dark:bg-blue-950/60 dark:text-blue-300' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                                <textarea id="attendance-reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder={modalMode === 'late' ? 'Add an optional note…' : 'Enter the reason for this absence…'} className="mt-3 w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#0047AB] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950" rows={3} />
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => { setShowReasonModal(false); setReasonStudent(null); }} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</button>
                            <button type="button" onClick={handleSaveReason} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-5 text-sm font-bold text-white transition-colors hover:bg-[#003b8f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><Save size={16} aria-hidden="true" /> Save details</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceRegister;
