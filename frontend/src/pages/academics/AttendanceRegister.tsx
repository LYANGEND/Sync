import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Calendar, Save, CheckCircle, XCircle, Clock, UserCheck,
    Search, BarChart2, Download,
    MessageSquare, Printer, Undo2, AlertTriangle, LayoutGrid,
    List, Volume2, VolumeX, Eye, Zap, Users, Pencil,
    X, Loader2, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import AttendanceAnalytics from '../../components/academics/AttendanceAnalytics';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { pickActiveTerm } from '../../hooks/useActiveTerm';
import NoActiveTermNotice from '../../components/academics/NoActiveTermNotice';
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

interface AcademicTerm {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status?: string;
    isActive?: boolean;
}

interface InstructionalDay {
    date: string;
    isInstructional: boolean;
}

type ViewMode = 'daily' | 'weekly' | 'analytics';

const AUTO_SAVE_KEY = 'attendance_draft';

/** Latest school day on or before today, otherwise the first school day of the term. */
const pickRegisterDate = (days: string[]) => {
    const today = new Date().toISOString().split('T')[0];
    return [...days].reverse().find(day => day <= today) || days[0] || '';
};

const formatSchoolDay = (day: string) => new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});

const FIELD_LABEL = 'mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300';
const FIELD = 'h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800 dark:focus:border-blue-400 dark:focus:ring-blue-950';
const ICON_BUTTON = 'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-300 text-slate-600 transition-colors hover:border-[#0047AB] hover:bg-surface-hover-accent hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300';

const AttendanceRegister = () => {
    const { confirm, notify } = useAppDialog();
    const [classes, setClasses] = useState<any[]>([]);
    const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
    const [instructionalDates, setInstructionalDates] = useState<Record<string, string[]>>({});
    const [selectedTermId, setSelectedTermId] = useState('');
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

    const selectedTerm = useMemo(
        () => academicTerms.find(term => term.id === selectedTermId),
        [academicTerms, selectedTermId],
    );
    const termClasses = useMemo(
        () => classes.filter(classOption => classOption.academicTermId === selectedTermId),
        [classes, selectedTermId],
    );
    const selectedTermInstructionalDates = instructionalDates[selectedTermId] || [];
    const dateIndex = selectedTermInstructionalDates.indexOf(date);
    const previousSchoolDay = dateIndex > 0 ? selectedTermInstructionalDates[dateIndex - 1] : '';
    const nextSchoolDay = dateIndex >= 0 ? (selectedTermInstructionalDates[dateIndex + 1] || '') : '';
    const noSchoolDays = !classesLoading && !!selectedTermId && selectedTermInstructionalDates.length === 0;

    useEffect(() => {
        if (selectedTermId && selectedClassId && date && viewMode === 'daily') {
            fetchAttendanceData();
        }
    }, [selectedTermId, selectedClassId, date, viewMode]);

    useEffect(() => {
        if (selectedTermId && selectedClassId && viewMode === 'weekly') {
            generateWeekDates();
        }
    }, [selectedTermId, selectedClassId, date, viewMode]);

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
                const draft = { academicTermId: selectedTermId, classId: selectedClassId, date, attendance, savedAt: Date.now() };
                localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(draft));
            }, 2000);
        }
        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    }, [attendance, isDirty, selectedTermId, selectedClassId, date]);

    // Fetch student streaks/sparklines when class loads
    useEffect(() => {
        if (selectedTermId && selectedClassId && students.length > 0) {
            fetchStudentHistory();
        }
    }, [selectedTermId, selectedClassId, students]);

    const fetchClasses = async () => {
        setClassesLoading(true);
        setLoadError(null);
        try {
            const termResponse = await api.get('/academic-terms');
            const allTerms: AcademicTerm[] = Array.isArray(termResponse.data) ? termResponse.data : [];
            const activeTerm = pickActiveTerm(allTerms);
            const nextTerms: AcademicTerm[] = activeTerm ? [activeTerm] : [];
            const [classResponses, calendarResponses] = await Promise.all([
                Promise.all(nextTerms.map(term => api.get('/classes', { params: { academicTermId: term.id } }))),
                Promise.all(nextTerms.map(term => api.get<InstructionalDay[]>(`/academic-terms/${term.id}/instructional-days`))),
            ]);
            const nextClasses = classResponses.flatMap(response => (
                Array.isArray(response.data) ? response.data : []
            ));
            const nextInstructionalDates = Object.fromEntries(nextTerms.map((term, index) => [
                term.id,
                calendarResponses[index].data
                    .filter(day => day.isInstructional)
                    .map(day => day.date.split('T')[0])
                    .sort(),
            ]));
            const defaultTerm = nextTerms[0];
            const defaultClasses = defaultTerm
                ? nextClasses.filter((classOption: any) => classOption.academicTermId === defaultTerm.id)
                : [];
            setClasses(nextClasses);
            setAcademicTerms(nextTerms);
            setInstructionalDates(nextInstructionalDates);
            if (defaultTerm) {
                setSelectedTermId(defaultTerm.id);
                setDate(pickRegisterDate(nextInstructionalDates[defaultTerm.id] || []));
            }
            if (defaultClasses.length > 0) {
                setSelectedClassId(defaultClasses[0].id);
                setSelectedClassName(defaultClasses[0].name);
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
        if (!selectedTerm) return;
        try {
            // Use analytics to get streak + sparkline data
            const termStart = new Date(selectedTerm.startDate);
            const termEnd = new Date(selectedTerm.endDate);
            const selectedDate = new Date(`${date}T00:00:00`);
            const endDate = selectedDate < termEnd ? selectedDate : termEnd;
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 30);
            if (startDate < termStart) startDate.setTime(termStart.getTime());

            const res = await api.get('/attendance/analytics', {
                params: {
                    classId: selectedClassId,
                    academicTermId: selectedTermId,
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
            const dateValue = d.toISOString().split('T')[0];
            const termStart = selectedTerm?.startDate.split('T')[0];
            const termEnd = selectedTerm?.endDate.split('T')[0];
            if (termStart && termEnd && dateValue >= termStart && dateValue <= termEnd && selectedTermInstructionalDates.includes(dateValue)) {
                dates.push(dateValue);
            }
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
                if (draft.academicTermId === selectedTermId && draft.classId === selectedClassId && draft.date === date && Date.now() - draft.savedAt < 3600000) {
                    const useDraft = await confirm({
                        title: 'Restore saved draft?',
                        message: 'We found unsaved attendance changes for this class and date. Would you like to restore them?',
                        confirmText: 'Restore draft',
                        cancelText: 'Discard',
                    });
                    if (useDraft) {
                        const classRes = await api.get(`/classes/${selectedClassId}`, {
                            params: { academicTermId: selectedTermId },
                        });
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

            const classRes = await api.get(`/classes/${selectedClassId}`, {
                params: { academicTermId: selectedTermId },
            });
            const classStudents = classRes.data.students || [];
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents(classStudents);

            const attendanceRes = await api.get('/attendance', {
                params: { classId: selectedClassId, academicTermId: selectedTermId, date },
            });
            const existingRecords = attendanceRes.data;

            existingRecords.forEach((record: any) => {
                if (record.student && !classStudents.some((student: any) => student.id === record.studentId)) {
                    classStudents.push({ id: record.studentId, ...record.student });
                }
            });
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents([...classStudents]);

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
            const classRes = await api.get(`/classes/${selectedClassId}`, {
                params: { academicTermId: selectedTermId },
            });
            const classStudents = classRes.data.students || [];
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents(classStudents);

            const weekData: Record<string, Record<string, 'PRESENT' | 'ABSENT' | 'LATE'>> = {};
            for (const d of weekDates) {
                const res = await api.get('/attendance', {
                    params: { classId: selectedClassId, academicTermId: selectedTermId, date: d },
                });
                res.data.forEach((r: any) => {
                    if (r.student && !classStudents.some((student: any) => student.id === r.studentId)) {
                        classStudents.push({ id: r.studentId, ...r.student });
                    }
                    if (!weekData[r.studentId]) weekData[r.studentId] = {};
                    weekData[r.studentId][d] = r.status;
                });
            }
            classStudents.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));
            setStudents([...classStudents]);
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
                academicTermId: selectedTermId,
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

    const changeRegister = async ({ classId = selectedClassId, date: nextDate = date }: { classId?: string; date?: string }) => {
        if (!classId || !nextDate || (classId === selectedClassId && nextDate === date)) return;
        if (isDirty) {
            const shouldChangeRegister = await confirm({
                title: 'Change attendance register?',
                message: 'This register has unsaved changes. A local draft has been kept, but the current marks have not been submitted.',
                confirmText: 'Change register',
                cancelText: 'Keep editing',
            });
            if (!shouldChangeRegister) return;
        }
        setSelectedClassId(classId);
        setSelectedClassName(classes.find(classOption => classOption.id === classId)?.name || '');
        setDate(nextDate);
    };

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
            await api.post('/attendance', {
                classId: selectedClassId,
                academicTermId: selectedTermId,
                date: new Date(dateStr).toISOString(),
                records,
            });
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

    const selectedDateLabel = date
        ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : 'No school day selected';
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

    if (!classesLoading && !loadError && academicTerms.length === 0) {
        return <div className="p-4 md:p-6"><NoActiveTermNotice /></div>;
    }

    if (viewMode === 'analytics') {
        return (
            <div className="mx-auto max-w-7xl bg-slate-50/70 p-4 dark:bg-slate-950/20 md:p-6">
                <AttendanceAnalytics
                    classId={selectedClassId}
                    className={selectedClassName}
                    academicTermId={selectedTermId}
                    termName={selectedTerm?.name || 'Academic term'}
                    termStartDate={selectedTerm?.startDate || ''}
                    termEndDate={selectedTerm?.endDate || ''}
                    onBack={() => setViewMode('daily')}
                />
            </div>
        );
    }

    return (
        <div className="printable-content min-w-0 pb-8 print:bg-white print:p-0">
            <div className="space-y-4 px-4 pt-3 md:px-6 print:space-y-3 print:p-0">
                <h1 className="hidden text-lg font-bold text-slate-950 print:block">Class attendance · {selectedClassName} · {selectedDateLabel}</h1>

                {/* Register controls */}
                <section aria-label="Register controls" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4 print:hidden">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,13rem)_minmax(0,20rem)_minmax(0,1fr)]">
                            <div className="min-w-0">
                                <label htmlFor="attendance-class" className={FIELD_LABEL}>Class</label>
                                <select id="attendance-class" value={selectedClassId} disabled={classesLoading || termClasses.length === 0} onChange={(event) => changeRegister({ classId: event.target.value })} className={`${FIELD} cursor-pointer`}>
                                    {termClasses.length === 0 && <option value="">{classesLoading ? 'Loading classes…' : 'No classes this term'}</option>}
                                    {termClasses.map(classOption => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <label htmlFor="attendance-date" className={FIELD_LABEL}>School day</label>
                                <div className="flex gap-1.5">
                                    <button type="button" onClick={() => changeRegister({ date: previousSchoolDay })} disabled={!previousSchoolDay} className={ICON_BUTTON} aria-label="Previous school day" title="Previous school day">
                                        <ChevronLeft size={18} aria-hidden="true" />
                                    </button>
                                    <select id="attendance-date" value={date} disabled={selectedTermInstructionalDates.length === 0} onChange={(event) => changeRegister({ date: event.target.value })} className={`${FIELD} cursor-pointer`}>
                                        {selectedTermInstructionalDates.length === 0 && <option value="">No school days set up</option>}
                                        {selectedTermInstructionalDates.map(day => <option key={day} value={day}>{formatSchoolDay(day)}</option>)}
                                    </select>
                                    <button type="button" onClick={() => changeRegister({ date: nextSchoolDay })} disabled={!nextSchoolDay} className={ICON_BUTTON} aria-label="Next school day" title="Next school day">
                                        <ChevronRight size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                                <label htmlFor="attendance-search" className={FIELD_LABEL}>Find a learner</label>
                                <div className="relative">
                                    <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <input id="attendance-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name or admission number" className={`${FIELD} pl-10`} />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900" role="tablist" aria-label="Attendance views">
                                {([
                                    { value: 'daily' as const, label: 'Register', icon: UserCheck },
                                    { value: 'weekly' as const, label: 'Week', icon: Calendar },
                                    { value: 'analytics' as const, label: 'Analytics', icon: BarChart2 },
                                ]).map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={viewMode === value}
                                        onClick={() => setViewMode(value)}
                                        className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${viewMode === value ? 'bg-white text-[#0047AB] shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                                    >
                                        <Icon size={15} aria-hidden="true" /> {label}
                                    </button>
                                ))}
                            </div>

                            {viewMode === 'daily' && (
                                <>
                                    <div className="inline-flex rounded-xl border border-slate-300 p-0.5 dark:border-slate-600" role="group" aria-label="Register layout">
                                        {([
                                            { value: 'list' as const, label: 'Use list view', icon: List },
                                            { value: 'photo' as const, label: 'Use photo grid', icon: LayoutGrid },
                                        ]).map(({ value, label, icon: Icon }) => (
                                            <button key={value} type="button" onClick={() => setDisplayMode(value)} aria-label={label} title={label} aria-pressed={displayMode === value} className={`grid h-10 w-10 cursor-pointer place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${displayMode === value ? 'bg-blue-50 text-[#0047AB] dark:bg-blue-950/60 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
                                                <Icon size={17} aria-hidden="true" />
                                            </button>
                                        ))}
                                    </div>
                                    <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} aria-label={soundEnabled ? 'Turn sound feedback off' : 'Turn sound feedback on'} title={soundEnabled ? 'Sound on' : 'Sound off'} aria-pressed={soundEnabled} className={ICON_BUTTON}>
                                        {soundEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
                                    </button>
                                    <button type="button" onClick={handleExportDaily} disabled={students.length === 0} className={ICON_BUTTON} title="Export register to Excel" aria-label="Export register to Excel">
                                        <Download size={18} aria-hidden="true" />
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={() => window.print()} className={ICON_BUTTON} title="Print register" aria-label="Print register">
                                <Printer size={18} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </section>

                {noSchoolDays && (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">
                        <p className="font-bold">No school days are set up for {selectedTerm?.name || 'this term'}.</p>
                        <p className="mt-1">Add instructional days under Daily → Calendar, then come back to take the register.</p>
                    </section>
                )}

                {/* Live daily summary */}
                {viewMode === 'daily' && !noSchoolDays && (
                    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:gap-6 print:hidden" aria-label="Attendance summary">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Attendance rate</p>
                                <p className="text-2xl font-bold tabular-nums text-[#003366] dark:text-white">{stats.rate}%</p>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                <div className="h-full rounded-full bg-gradient-to-r from-[#0047AB] to-emerald-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.min(attendanceRate, 100)}%` }} />
                            </div>
                        </div>
                        <dl className="grid grid-cols-4 divide-x divide-slate-200 dark:divide-slate-700 sm:min-w-[22rem]">
                            {[
                                { label: 'Learners', value: stats.total, color: 'text-slate-900 dark:text-white' },
                                { label: 'Present', value: stats.present, color: 'text-emerald-700 dark:text-emerald-300' },
                                { label: 'Absent', value: stats.absent, color: 'text-red-700 dark:text-red-300' },
                                { label: 'Late', value: stats.late, color: 'text-orange-700 dark:text-orange-300' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="flex flex-col-reverse px-3 text-center">
                                    <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
                                    <dd className={`text-xl font-bold tabular-nums ${color}`}>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                )}

                {/* Daily register */}
                {viewMode === 'daily' && displayMode === 'list' && !noSchoolDays && (
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
                                    <button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2">
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
                                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="mt-4 min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:text-slate-200">Clear search</button>}
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
                                                    <button type="button" onClick={() => { setReasonStudent(student); setReasonText(rec.reason || ''); setModalMode('reason'); setShowReasonModal(true); }} className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-surface-hover-accent hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-300">
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
                                                    <tr key={student.id} className="transition-colors hover:bg-surface-hover">
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
                                                                <button type="button" onClick={() => { setReasonStudent(student); setReasonText(rec.reason || ''); setModalMode('reason'); setShowReasonModal(true); }} className="inline-flex min-h-9 max-w-36 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:bg-surface-hover-accent hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-300">
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
                {viewMode === 'daily' && displayMode === 'photo' && !noSchoolDays && (
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
                                <div className="max-w-sm"><AlertTriangle className="mx-auto text-red-500" size={30} aria-hidden="true" /><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{loadError}</p><button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
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
                {viewMode === 'weekly' && !noSchoolDays && (
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
                                <button type="button" onClick={() => setWeeklyEditable(!weeklyEditable)} aria-pressed={weeklyEditable} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${weeklyEditable ? 'border-blue-300 bg-blue-50 text-[#0047AB] dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300' : 'border-slate-300 bg-white text-slate-700 hover:bg-surface-hover dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'}`}>
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
                                <div className="max-w-sm"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300"><AlertTriangle size={22} aria-hidden="true" /></span><p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{loadError}</p><button type="button" onClick={retryCurrentView} className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"><RefreshCw size={16} aria-hidden="true" /> Try again</button></div>
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
                                            <tr key={student.id} className="transition-colors hover:bg-surface-hover">
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
                                                                <button type="button" onClick={() => handleWeeklyStatusChange(student.id, d)} aria-label={`Start attendance for ${student.firstName} on ${new Date(`${d}T00:00:00`).toLocaleDateString()}`} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm font-bold text-slate-400 transition-colors hover:border-[#0047AB] hover:bg-surface-hover-accent hover:text-[#0047AB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600">+</button>
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
                                        <button key={d} type="button" onClick={() => saveWeeklyDay(d)} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2">
                                            <Save size={15} aria-hidden="true" /> {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* Save bar: only while there are unsaved changes */}
                {viewMode === 'daily' && isDirty && (
                    <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-md dark:border-amber-900 dark:bg-slate-800/95 sm:flex-row sm:items-center sm:justify-between sm:p-4 print:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                                <AlertTriangle size={18} aria-hidden="true" />
                            </span>
                            <div className="min-w-0" aria-live="polite">
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Unsaved attendance changes</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{selectedClassName || 'Selected class'} · {selectedDateLabel}. A local draft is kept while you work.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {undoStack.length > 0 && (
                                <button type="button" onClick={handleUndo} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:text-slate-200 sm:flex-none" title="Undo last change">
                                    <Undo2 size={17} aria-hidden="true" /> Undo
                                </button>
                            )}
                            <button type="button" onClick={handleSave} disabled={saving || loading || students.length === 0} className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-800 sm:flex-none">
                                {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                                {saving ? 'Saving attendance…' : 'Save attendance'}
                            </button>
                        </div>
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
                            <button type="button" onClick={() => { setShowReasonModal(false); setReasonStudent(null); }} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:bg-surface-hover hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:text-slate-400 dark:hover:text-white" aria-label="Close attendance details">
                                <X size={19} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="space-y-5 p-5 sm:p-6">
                            {modalMode === 'late' && (
                                <fieldset>
                                    <legend className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">How many minutes late?</legend>
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                        {[5, 10, 15, 30, 45, 60].map(mins => (
                                            <button key={mins} type="button" onClick={() => setLateMinutes(mins)} aria-pressed={lateMinutes === mins} className={`min-h-11 cursor-pointer rounded-xl border text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${lateMinutes === mins ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' : 'border-slate-300 bg-white text-slate-600 hover:bg-surface-hover dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>
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
                                        <button key={reason} type="button" onClick={() => setReasonText(reason)} aria-pressed={reasonText === reason} className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] ${reasonText === reason ? 'border-blue-400 bg-blue-50 text-[#0047AB] dark:bg-blue-950/60 dark:text-blue-300' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-surface-hover dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                                <textarea id="attendance-reason" value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder={modalMode === 'late' ? 'Add an optional note…' : 'Enter the reason for this absence…'} className="mt-3 w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#0047AB] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950" rows={3} />
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => { setShowReasonModal(false); setReasonStudent(null); }} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Cancel</button>
                            <button type="button" onClick={handleSaveReason} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"><Save size={16} aria-hidden="true" /> Save details</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AttendanceRegister;
