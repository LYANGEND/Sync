import React, { useState, useEffect } from 'react';
import { Calendar, User, Plus, Trash2, Users, Download, Printer } from 'lucide-react';
import api from '../../utils/api';
import { AcademicFilterButton, AcademicFilterDialog } from '../../components/academics/AcademicFilterDialog';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface TimetablePeriod {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacher?: {
    id: string;
    fullName: string;
  };
  classes?: {
    class: {
      id: string;
      name: string;
    };
  }[];
  classNames?: string[];
  isCombined?: boolean;
}

interface Class {
  id: string;
  name: string;
  academicTermId?: string;
  subjects?: Subject[];
}

interface Teacher {
  id: string;
  fullName: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface TeacherAssignment {
  classId: string;
  subjectId: string;
  subject: Subject;
}

interface AcademicTerm {
  id: string;
  name: string;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const Timetable = () => {
    const { confirm } = useAppDialog();
  const { user } = useAuth();
  const { settings: themeSettings } = useTheme();
  const [viewMode, setViewMode] = useState<'CLASS' | 'TEACHER'>('CLASS');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftViewMode, setDraftViewMode] = useState<'CLASS' | 'TEACHER'>('CLASS');
  const [draftClassId, setDraftClassId] = useState<string>('');
  const [draftTeacherId, setDraftTeacherId] = useState<string>('');
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null);

  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const canSwitchView = ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'].includes(user?.role || '');
  const selectableTeachers = user?.role === 'TEACHER'
    ? [{ id: user.id, fullName: user.fullName }]
    : teachers;
  const selectedViewLabel = viewMode === 'CLASS'
    ? classes.find(classOption => classOption.id === selectedClassId)?.name
    : selectableTeachers.find(teacher => teacher.id === selectedTeacherId)?.fullName;
  const activeFilterCount = selectedViewLabel ? 2 : 1;

  // Form State - now with classIds array
  const [newPeriod, setNewPeriod] = useState({
    dayOfWeek: 'MONDAY',
    startTime: '08:00',
    endTime: '08:40',
    subjectId: '',
    teacherId: '',
    classIds: [] as string[] // Multiple classes
  });
  const closePeriodDialog = () => {
    if (!savingPeriod) setShowAddModal(false);
  };
  const periodDialogRef = useDialogAccessibility(showAddModal, closePeriodDialog);
  const selectedPeriodClass = classes.find(classOption => classOption.id === selectedClassId);
  const activeClassIds = new Set(classes.map(classOption => classOption.id));
  const allocatedTeacherSubjects = teacherAssignments
    .filter(assignment => activeClassIds.has(assignment.classId))
    .map(assignment => assignment.subject)
    .filter((subject, index, options) => options.findIndex(option => option.id === subject.id) === index);
  const availablePeriodSubjects = viewMode === 'CLASS'
    ? (selectedPeriodClass?.subjects || []).filter(subject => (
        user?.role !== 'TEACHER' || teacherAssignments.some(assignment => (
          assignment.classId === selectedClassId && assignment.subjectId === subject.id
        ))
      ))
    : allocatedTeacherSubjects;
  const eligiblePeriodClasses = newPeriod.subjectId
    ? classes.filter(classOption => (
        classOption.subjects?.some(subject => subject.id === newPeriod.subjectId)
        && (viewMode !== 'TEACHER' || teacherAssignments.some(assignment => (
          assignment.classId === classOption.id && assignment.subjectId === newPeriod.subjectId
        )))
      ))
    : classes;

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (currentTerm) {
      if (viewMode === 'CLASS' && selectedClassId) {
        fetchClassTimetable();
      } else if (viewMode === 'TEACHER' && selectedTeacherId) {
        fetchTeacherTimetable();
      }
    }
  }, [viewMode, selectedClassId, selectedTeacherId, currentTerm]);

  useEffect(() => {
    let cancelled = false;

    const allocationTeacherId = user?.role === 'TEACHER'
      ? user.id
      : (viewMode === 'TEACHER' ? selectedTeacherId : '');

    if (!allocationTeacherId || !['SUPER_ADMIN', 'TEACHER'].includes(user?.role || '')) {
      setTeacherAssignments([]);
      setLoadingAssignments(false);
      setAssignmentError(null);
      return () => { cancelled = true; };
    }

    setLoadingAssignments(true);
    setAssignmentError(null);
    setNewPeriod(previous => ({ ...previous, subjectId: '', classIds: [] }));
    api.get(`/academics/teacher/${allocationTeacherId}`)
      .then(response => {
        if (!cancelled) setTeacherAssignments(response.data);
      })
      .catch(error => {
        console.error('Error fetching teacher subject allocations:', error);
        if (!cancelled) {
          setTeacherAssignments([]);
          setAssignmentError('Teacher subject allocations could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAssignments(false);
      });

    return () => { cancelled = true; };
  }, [viewMode, selectedTeacherId, user?.id, user?.role]);

  const fetchInitialData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const isParent = user?.role === 'PARENT';

      const termsRes = await api.get('/academic-terms');

      const activeTerm = termsRes.data.find((t: any) => t.isActive) || termsRes.data[0];
      if (!activeTerm) {
        setCurrentTerm(null);
        setClasses([]);
        setPeriods([]);
        setLoadError('Create an academic term before managing the timetable.');
        return;
      }
      setCurrentTerm(activeTerm);

      if (isParent) {
        // For Parents: specific classes only
        const childrenRes = await api.get('/students/my-children', {
          params: { academicTermId: activeTerm.id },
        });
        const childClasses = childrenRes.data
          .map((c: any) => c.class)
          .filter((c: any) => c) // remove nulls
          .filter((c: any) => !c.academicTermId || c.academicTermId === activeTerm?.id)
          .reduce((acc: any[], current: any) => {
            const x = acc.find((item: any) => item.id === current.id);
            if (!x) return acc.concat([current]);
            return acc;
          }, []);

        setClasses(childClasses);
        if (childClasses.length > 0) {
          setSelectedClassId(childClasses[0].id);
        }
      } else {
        // For Admin/Teachers: All classes
        const [classesRes, teachersRes] = await Promise.all([
          api.get('/classes', { params: { academicTermId: activeTerm.id } }),
          api.get('/users/teachers')
        ]);

        const activeTermClasses = classesRes.data.filter((classOption: Class) => (
          !activeTerm?.id || !classOption.academicTermId || classOption.academicTermId === activeTerm.id
        ));
        setClasses(activeTermClasses);
        setTeachers(teachersRes.data);

        if (user?.role === 'TEACHER') {
          setViewMode('TEACHER');
          setSelectedTeacherId(user.id);
        } else if (activeTermClasses.length > 0) {
          setSelectedClassId(activeTermClasses[0].id);
        }
      }

    } catch (error) {
      console.error('Error fetching initial data:', error);
      setLoadError('Timetable options could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassTimetable = async () => {
    if (!selectedClassId || !currentTerm) return;
    setLoading(true);
    try {
      setLoadError(null);
      const response = await api.get(`/timetables/class/${selectedClassId}?termId=${currentTerm.id}`);
      setPeriods(response.data);
    } catch (error) {
      console.error('Error fetching class timetable:', error);
      setPeriods([]);
      setLoadError('This class timetable could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherTimetable = async () => {
    if (!selectedTeacherId || !currentTerm) return;
    setLoading(true);
    try {
      setLoadError(null);
      const response = await api.get(`/timetables/teacher/${selectedTeacherId}?termId=${currentTerm.id}`);
      setPeriods(response.data);
    } catch (error) {
      console.error('Error fetching teacher timetable:', error);
      setPeriods([]);
      setLoadError('This teacher timetable could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const openFilters = () => {
    setDraftViewMode(viewMode);
    setDraftClassId(selectedClassId);
    setDraftTeacherId(selectedTeacherId);
    setShowFilters(true);
  };

  const resetDraftFilters = () => {
    if (user?.role === 'TEACHER') {
      setDraftViewMode('TEACHER');
      setDraftTeacherId(user.id);
      setDraftClassId('');
      return;
    }

    setDraftViewMode('CLASS');
    setDraftClassId(classes[0]?.id || '');
    setDraftTeacherId('');
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftViewMode === 'CLASS' && !draftClassId) return;
    if (draftViewMode === 'TEACHER' && !draftTeacherId) return;

    setViewMode(draftViewMode);
    setSelectedClassId(draftClassId);
    setSelectedTeacherId(draftTeacherId);
    setShowFilters(false);
  };

  const handleAddPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTerm) return;

    if (newPeriod.startTime >= newPeriod.endTime) {
      setPeriodError('End time must be after start time.');
      return;
    }

    try {
      // Build classIds array
      const classIdsToSend = viewMode === 'CLASS' && selectedClassId
        ? [selectedClassId]
        : newPeriod.classIds;
      if (classIdsToSend.length === 0) {
        setPeriodError('Select at least one class.');
        return;
      }

      setSavingPeriod(true);
      setPeriodError(null);
      await api.post('/timetables', {
        classIds: classIdsToSend,
        dayOfWeek: newPeriod.dayOfWeek,
        startTime: newPeriod.startTime,
        endTime: newPeriod.endTime,
        subjectId: newPeriod.subjectId,
        // Don't send teacherId - backend will auto-fill from subject's assigned teacher
        ...(viewMode === 'TEACHER' && selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
        academicTermId: currentTerm.id,
      });

      setShowAddModal(false);
      // Refresh
      if (viewMode === 'CLASS') await fetchClassTimetable();
      else await fetchTeacherTimetable();

      // Reset form
      setNewPeriod(prev => ({ ...prev, startTime: prev.endTime, endTime: '', classIds: [] }));
    } catch (error: any) {
      console.error('Error adding period:', error);
      setPeriodError(error.response?.data?.message || 'Failed to add period.');
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleDeletePeriod = async (id: string) => {
    if (!(await confirm({
      title: 'Delete period?',
      message: 'Are you sure you want to delete this period?',
      confirmText: 'Delete period',
    }))) return;
    try {
      await api.delete(`/timetables/${id}`);
      if (viewMode === 'CLASS') fetchClassTimetable();
      else fetchTeacherTimetable();
    } catch (error) {
      console.error('Error deleting period:', error);
    }
  };

  const getPeriodsForDay = (day: string) => {
    return periods.filter(p => p.dayOfWeek === day);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (periods.length === 0) {
      alert('No timetable data to export');
      return;
    }

    const headers = ['Day', 'Start Time', 'End Time', 'Subject', 'Subject Code', 'Teacher', 'Classes'];
    const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

    const sortedPeriods = [...periods].sort((a, b) => {
      const dayDiff = DAYS_ORDER.indexOf(a.dayOfWeek) - DAYS_ORDER.indexOf(b.dayOfWeek);
      if (dayDiff !== 0) return dayDiff;
      return a.startTime.localeCompare(b.startTime);
    });

    const rows = sortedPeriods.map(period => [
      period.dayOfWeek,
      period.startTime,
      period.endTime,
      period.subject.name,
      period.subject.code,
      period.teacher?.fullName || 'N/A',
      period.classNames?.join('; ') || 'N/A'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const selectedClass = classes.find(c => c.id === selectedClassId);
    const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);
    const filename = viewMode === 'CLASS'
      ? `timetable_${selectedClass?.name || 'class'}_${currentTerm?.name || 'term'}.csv`
      : `timetable_${selectedTeacher?.fullName?.replace(/\s+/g, '_') || 'teacher'}_${currentTerm?.name || 'term'}.csv`;

    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print timetable
  const printTimetable = () => {
    const selectedClass = classes.find(c => c.id === selectedClassId);
    const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);
    const entityName = viewMode === 'CLASS'
      ? selectedClass?.name || 'Class'
      : selectedTeacher?.fullName || 'Teacher';
    const entityType = viewMode === 'CLASS' ? 'Class Schedule' : 'Teacher Schedule';

    const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    const DAY_COLORS: Record<string, string> = {
      'MONDAY': '#3b82f6',
      'TUESDAY': '#10b981',
      'WEDNESDAY': '#f59e0b',
      'THURSDAY': '#8b5cf6',
      'FRIDAY': '#ec4899'
    };

    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(entityType)} - ${escapeHtml(entityName)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            background: #f8fafc;
            color: #1e293b;
            line-height: 1.5;
          }
          
          .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 30px;
            background: white;
            min-height: 100vh;
          }
          
          /* Header */
          .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 3px solid #3b82f6;
          }
          
          .school-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            border-radius: 16px;
            margin-bottom: 16px;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
          }
          
          .school-badge svg {
            width: 36px;
            height: 36px;
            fill: white;
          }
          
          .school-name {
            font-size: 24px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          .title {
            font-size: 28px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
          }
          
          .subtitle {
            font-size: 18px;
            color: #3b82f6;
            font-weight: 600;
            margin-bottom: 4px;
          }
          
          .term-badge {
            display: inline-block;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            color: #0369a1;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            margin-top: 12px;
            border: 1px solid #bae6fd;
          }
          
          /* Week Grid */
          .week-grid {
            display: grid;
            gap: 20px;
          }
          
          .day-card {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
            border: 1px solid #e2e8f0;
          }
          
          .day-header {
            padding: 14px 20px;
            color: white;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          
          .day-header .icon {
            width: 20px;
            height: 20px;
            opacity: 0.9;
          }
          
          .periods-list {
            padding: 0;
          }
          
          .period-row {
            display: grid;
            grid-template-columns: 120px 1fr 180px;
            gap: 16px;
            padding: 16px 20px;
            border-bottom: 1px solid #f1f5f9;
            align-items: center;
          }
          
          .period-row:last-child {
            border-bottom: none;
          }
          
          .period-row:hover {
            background: #fafbfc;
          }
          
          .time-slot {
            font-size: 13px;
            font-weight: 600;
            color: #475569;
            background: #f1f5f9;
            padding: 6px 12px;
            border-radius: 8px;
            text-align: center;
          }
          
          .subject-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          
          .subject-name {
            font-weight: 600;
            color: #1e293b;
            font-size: 15px;
          }
          
          .subject-code {
            font-size: 12px;
            color: #64748b;
            font-weight: 500;
          }
          
          .teacher-info {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #475569;
          }
          
          .teacher-avatar {
            width: 28px;
            height: 28px;
            background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            color: #4338ca;
          }
          
          .combined-badge {
            display: inline-block;
            background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
            color: #7c3aed;
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 12px;
            font-weight: 600;
            margin-left: 8px;
            border: 1px solid #e9d5ff;
          }
          
          .no-classes {
            padding: 24px 20px;
            text-align: center;
            color: #94a3b8;
            font-style: italic;
            font-size: 14px;
          }
          
          /* Footer */
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #94a3b8;
          }
          
          .footer-logo {
            font-weight: 600;
            color: #64748b;
          }
          
          /* Print Styles */
          @media print {
            body { 
              background: white; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .container { 
              padding: 20px; 
              box-shadow: none;
            }
            .day-card {
              break-inside: avoid;
              box-shadow: none;
              border: 1px solid #d1d5db;
            }
            .period-row {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="school-badge" style="background: transparent; box-shadow: none;">
              ${themeSettings.logoUrl
        ? `<img src="${escapeHtml(themeSettings.logoUrl.startsWith('http') ? themeSettings.logoUrl : window.location.origin + themeSettings.logoUrl)}" alt="Logo" style="width: 80px; height: 80px; object-fit: contain;">`
        : `<div style="width: 70px; height: 70px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);">
                     <svg viewBox="0 0 24 24" style="width: 36px; height: 36px; fill: white;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                   </div>`
      }
            </div>
            <p class="school-name">${escapeHtml(themeSettings.schoolName || 'School Name')}</p>
            <h1 class="title">${escapeHtml(entityName)}</h1>
            <p class="subtitle">${escapeHtml(entityType)}</p>
            <span class="term-badge">📅 ${escapeHtml(currentTerm?.name || 'Academic Term')}</span>
          </div>
          
          <div class="week-grid">
            ${DAYS_ORDER.map(day => {
        const dayPeriods = periods.filter(p => p.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
        const dayColor = DAY_COLORS[day] || '#3b82f6';

        return `
                <div class="day-card">
                  <div class="day-header" style="background: linear-gradient(135deg, ${dayColor} 0%, ${dayColor}dd 100%);">
                    <svg class="icon" viewBox="0 0 24 24" fill="white"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
                    ${day}
                  </div>
                  ${dayPeriods.length === 0
            ? '<div class="no-classes">No scheduled classes</div>'
            : `<div class="periods-list">
                        ${dayPeriods.map(period => {
              const initials = (period.teacher?.fullName || 'NA').split(' ').map(n => n[0]).join('').substring(0, 2);
              return `
                            <div class="period-row">
                              <div class="time-slot">${escapeHtml(period.startTime)} - ${escapeHtml(period.endTime)}</div>
                              <div class="subject-info">
                                <span class="subject-name">${escapeHtml(period.subject.name)}</span>
                                <span class="subject-code">${escapeHtml(period.subject.code)}</span>
                              </div>
                              <div class="teacher-info">
                                <div class="teacher-avatar">${escapeHtml(initials)}</div>
                                ${viewMode === 'CLASS'
                  ? escapeHtml(period.teacher?.fullName || 'Not Assigned')
                  : escapeHtml(period.classNames?.join(', ') || 'N/A')}
                                ${period.isCombined ? '<span class="combined-badge">Combined</span>' : ''}
                              </div>
                            </div>
                          `;
            }).join('')}
                      </div>`
          }
                </div>
              `;
      }).join('')}
          </div>
          
          <div class="footer">
            <span class="footer-logo">📚 ${escapeHtml(themeSettings.schoolName || 'School Name')}</span>
            <span>Generated on ${escapeHtml(currentDate)}</span>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Calendar className="text-blue-600" />
            Class Timetable
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {currentTerm ? `${currentTerm.name} Schedule` : 'Loading term...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AcademicFilterButton onClick={openFilters} activeCount={activeFilterCount} />
          <span className="hidden max-w-52 truncate rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 sm:inline-block">
            {viewMode === 'CLASS' ? 'Class' : 'Teacher'}: {selectedViewLabel || 'Not selected'}
          </span>

          {(user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER') && (
            <button
              onClick={() => { setPeriodError(null); setShowAddModal(true); }}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2"
              disabled={!currentTerm || (viewMode === 'CLASS' ? !selectedClassId : !selectedTeacherId)}
            >
              <Plus size={20} />
              Add Period
            </button>
          )}

          {/* Export Buttons */}
          {periods.length > 0 && (
            <>
              <button
                onClick={exportToCSV}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                title="Export to CSV"
              >
                <Download size={18} />
                CSV
              </button>
              <button
                onClick={printTimetable}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                title="Print / Save as PDF"
              >
                <Printer size={18} />
                Print
              </button>
            </>
          )}
        </div>
      </div>

      <AcademicFilterDialog
        open={showFilters}
        title="Filter timetable"
        description="Choose whether to view a class or teacher schedule, then select the timetable to load."
        onClose={() => setShowFilters(false)}
        onApply={applyFilters}
        onReset={resetDraftFilters}
        applyDisabled={draftViewMode === 'CLASS' ? !draftClassId : !draftTeacherId}
      >
        {canSwitchView && (
          <fieldset>
            <legend className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-200">Schedule type</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {(['CLASS', 'TEACHER'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  data-filter-autofocus={mode === draftViewMode ? 'true' : undefined}
                  onClick={() => setDraftViewMode(mode)}
                  className={`min-h-11 rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] ${draftViewMode === mode
                    ? 'bg-white text-[#1E40AF] shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                  aria-pressed={draftViewMode === mode}
                >
                  {mode === 'CLASS' ? 'Class view' : 'Teacher view'}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {draftViewMode === 'CLASS' ? (
          <div>
            <label htmlFor="timetable-class-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Class</label>
            <select
              id="timetable-class-filter"
              data-filter-autofocus={!canSwitchView ? 'true' : undefined}
              value={draftClassId}
              onChange={(event) => setDraftClassId(event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
            >
              <option value="">Select class</option>
              {classes.map(classOption => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="timetable-teacher-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Teacher</label>
            <select
              id="timetable-teacher-filter"
              data-filter-autofocus={!canSwitchView ? 'true' : undefined}
              value={draftTeacherId}
              onChange={(event) => setDraftTeacherId(event.target.value)}
              className="h-12 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
            >
              <option value="">Select teacher</option>
              {selectableTeachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
            </select>
          </div>
        )}
      </AcademicFilterDialog>

      {/* Timetable Grid */}
      {loadError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={fetchInitialData} className="min-h-10 rounded-lg bg-red-100 px-3 font-semibold hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900">Retry</button>
        </div>
      )}
      {loading && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300" role="status">
          Loading timetable…
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {DAYS.map(day => (
          <div key={day} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
            <div className="bg-gray-50 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600 font-semibold text-gray-700 dark:text-gray-200 text-center">
              {day}
            </div>
            <div className="p-2 space-y-2 flex-1 min-h-[200px]">
              {getPeriodsForDay(day).length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm italic">
                  No classes
                </div>
              ) : (
                getPeriodsForDay(day).map(period => (
                  <div key={period.id} className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg p-3 hover:shadow-md transition-shadow relative group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-blue-800 dark:text-blue-300 bg-blue-100 dark:bg-blue-800/50 px-2 py-0.5 rounded">
                        {period.startTime} - {period.endTime}
                      </span>
                      {(user?.role === 'SUPER_ADMIN' || (user?.role === 'TEACHER' && period.teacher?.id === user.id)) && (
                        <button
                          onClick={() => handleDeletePeriod(period.id)}
                          className="grid size-9 place-items-center rounded-lg text-red-400 opacity-100 transition-colors hover:bg-red-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          aria-label={`Delete ${period.subject.name} period from ${period.startTime} to ${period.endTime}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <h4 className="font-bold text-gray-800 dark:text-white text-sm mb-1">{period.subject.name}</h4>
                    <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      {viewMode === 'CLASS' ? (
                        <>
                          <User size={12} />
                          {period.teacher?.fullName || 'No Teacher'}
                          {period.isCombined && (
                            <span className="ml-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs">
                              Combined: {period.classNames?.join(', ')}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Users size={12} />
                          {period.classNames?.join(', ') || 'No Classes'}
                          {period.isCombined && (
                            <span className="ml-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs">
                              Combined
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Period Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePeriodDialog(); }}>
          <div ref={periodDialogRef} className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="timetable-period-dialog-title">
            <h2 id="timetable-period-dialog-title" className="text-xl font-bold mb-4 dark:text-white">Add Timetable Period</h2>
            <form onSubmit={handleAddPeriod} className="space-y-4">
              {periodError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{periodError}</div>
              )}
              {(viewMode === 'TEACHER' || user?.role === 'TEACHER') && assignmentError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{assignmentError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="timetable-period-day" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day</label>
                  <select
                    id="timetable-period-day"
                    data-dialog-autofocus="true"
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    value={newPeriod.dayOfWeek}
                    onChange={(e) => setNewPeriod({ ...newPeriod, dayOfWeek: e.target.value })}
                  >
                    {DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="timetable-period-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                  <select
                    id="timetable-period-subject"
                    required
                    disabled={(viewMode === 'TEACHER' || user?.role === 'TEACHER') && (loadingAssignments || Boolean(assignmentError))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    value={newPeriod.subjectId}
                    onChange={(e) => {
                      const subjectId = e.target.value;
                      setNewPeriod(previous => ({
                        ...previous,
                        subjectId,
                        classIds: previous.classIds.filter(classId => {
                          const classOption = classes.find(item => item.id === classId);
                          const classHasSubject = Boolean(classOption?.subjects?.some(subject => subject.id === subjectId));
                          const teacherHasAllocation = viewMode !== 'TEACHER' || teacherAssignments.some(assignment => (
                            assignment.classId === classId && assignment.subjectId === subjectId
                          ));
                          return classHasSubject && teacherHasAllocation;
                        }),
                      }));
                    }}
                  >
                    <option value="">{loadingAssignments ? 'Loading subjects…' : 'Select Subject'}</option>
                    {availablePeriodSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="timetable-period-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                  <input
                    id="timetable-period-start"
                    type="time"
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    value={newPeriod.startTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="timetable-period-end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                  <input
                    id="timetable-period-end"
                    type="time"
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    value={newPeriod.endTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, endTime: e.target.value })}
                  />
                </div>
              </div>

              {viewMode === 'CLASS' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teacher</label>
                  {!newPeriod.subjectId ? (
                    <div className="px-3 py-2 border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 rounded-lg text-gray-500 dark:text-gray-400 text-sm italic">
                      Select a subject first
                    </div>
                  ) : (
                    <div className="px-3 py-2 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-800 dark:text-blue-300 text-sm flex items-center gap-2">
                      <User size={16} />
                      Teacher will be auto-assigned from Subject Allocation
                    </div>
                  )}
                </div>
              ) : (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Classes <span className="text-gray-400 dark:text-gray-500 text-xs">(Select one or more for combined sessions)</span>
                  </legend>
                  <div className="border border-gray-300 dark:border-slate-600 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1 bg-white dark:bg-slate-700">
                    {!loadingAssignments && newPeriod.subjectId && eligiblePeriodClasses.length === 0 && (
                      <p className="p-2 text-sm text-gray-500 dark:text-gray-400">This teacher has no class allocation for the selected subject.</p>
                    )}
                    {eligiblePeriodClasses.map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-1 hover:bg-surface-hover rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPeriod.classIds.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewPeriod({ ...newPeriod, classIds: [...newPeriod.classIds, c.id] });
                            } else {
                              setNewPeriod({ ...newPeriod, classIds: newPeriod.classIds.filter(id => id !== c.id) });
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {newPeriod.classIds.length > 1 && (
                    <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                      <Users size={12} />
                      Combined session: {newPeriod.classIds.length} classes selected
                    </p>
                  )}
                </fieldset>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closePeriodDialog}
                  disabled={savingPeriod}
                  className="min-h-11 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPeriod || loadingAssignments || Boolean(assignmentError)}
                  className="min-h-11 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPeriod ? 'Adding…' : 'Add Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timetable;
