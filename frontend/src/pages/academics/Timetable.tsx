import React, { useState, useEffect } from 'react';
import { User, Plus, Trash2, Users, Download, Printer } from 'lucide-react';
import api from '../../utils/api';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PageHeader } from '../../components/ui/DesignSystem';

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

interface AcademicTerm {
  id: string;
  name: string;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const Timetable = () => {
    const { confirm } = useAppDialog();
  const { user } = useAuth();
  const { settings: themeSettings } = useTheme();
  const [viewMode, setViewMode] = useState<'CLASS' | 'TEACHER'>('CLASS');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null);

  const [periods, setPeriods] = useState<TimetablePeriod[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State - now with classIds array
  const [newPeriod, setNewPeriod] = useState({
    dayOfWeek: 'MONDAY',
    startTime: '08:00',
    endTime: '08:40',
    subjectId: '',
    teacherId: '',
    classIds: [] as string[] // Multiple classes
  });

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

  const fetchInitialData = async () => {
    try {
      const isParent = user?.role === 'PARENT';

      const [termsRes, subjectsRes] = await Promise.all([
        api.get('/academic-terms'),
        api.get('/subjects')
      ]);

      const activeTerm = termsRes.data.find((t: any) => t.isActive) || termsRes.data[0];
      setCurrentTerm(activeTerm);
      setSubjects(subjectsRes.data);

      if (isParent) {
        // For Parents: specific classes only
        const childrenRes = await api.get('/students/my-children');
        const childClasses = childrenRes.data
          .map((c: any) => c.class)
          .filter((c: any) => c) // remove nulls
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
          api.get('/classes'),
          api.get('/users/teachers')
        ]);

        setClasses(classesRes.data);
        setTeachers(teachersRes.data);

        if (user?.role === 'TEACHER') {
          setViewMode('TEACHER');
          setSelectedTeacherId(user.id);
        } else if (classesRes.data.length > 0) {
          setSelectedClassId(classesRes.data[0].id);
        }
      }

    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchClassTimetable = async () => {
    if (!selectedClassId || !currentTerm) return;
    setLoading(true);
    try {
      const response = await api.get(`/timetables/class/${selectedClassId}?termId=${currentTerm.id}`);
      setPeriods(response.data);
    } catch (error) {
      console.error('Error fetching class timetable:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherTimetable = async () => {
    if (!selectedTeacherId || !currentTerm) return;
    setLoading(true);
    try {
      const response = await api.get(`/timetables/teacher/${selectedTeacherId}?termId=${currentTerm.id}`);
      setPeriods(response.data);
    } catch (error) {
      console.error('Error fetching teacher timetable:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTerm) return;

    try {
      // Build classIds array
      let classIdsToSend = newPeriod.classIds;
      if (viewMode === 'CLASS' && selectedClassId && classIdsToSend.length === 0) {
        classIdsToSend = [selectedClassId];
      }

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
      if (viewMode === 'CLASS') fetchClassTimetable();
      else fetchTeacherTimetable();

      // Reset form
      setNewPeriod(prev => ({ ...prev, startTime: prev.endTime, endTime: '', classIds: [] }));
    } catch (error: any) {
      console.error('Error adding period:', error);
      alert(error.response?.data?.message || 'Failed to add period');
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

  // Print timetable: intentionally preserve the standalone print document and its styling.
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
        <title>${entityType} - ${entityName}</title>
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
        ? `<img src="${themeSettings.logoUrl.startsWith('http') ? themeSettings.logoUrl : window.location.origin + themeSettings.logoUrl}" alt="Logo" style="width: 80px; height: 80px; object-fit: contain;">`
        : `<div style="width: 70px; height: 70px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);">
                     <svg viewBox="0 0 24 24" style="width: 36px; height: 36px; fill: white;"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/></svg>
                   </div>`
      }
            </div>
            <p class="school-name">${themeSettings.schoolName || 'School Name'}</p>
            <h1 class="title">${entityName}</h1>
            <p class="subtitle">${entityType}</p>
            <span class="term-badge">📅 ${currentTerm?.name || 'Academic Term'}</span>
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
                              <div class="time-slot">${period.startTime} - ${period.endTime}</div>
                              <div class="subject-info">
                                <span class="subject-name">${period.subject.name}</span>
                                <span class="subject-code">${period.subject.code}</span>
                              </div>
                              <div class="teacher-info">
                                <div class="teacher-avatar">${initials}</div>
                                ${viewMode === 'CLASS'
                  ? (period.teacher?.fullName || 'Not Assigned')
                  : (period.classNames?.join(', ') || 'N/A')}
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
            <span class="footer-logo">📚 ${themeSettings.schoolName || 'School Name'}</span>
            <span>Generated on ${currentDate}</span>
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
    <div className="ds-page">
      <PageHeader title="Class Timetable" description={currentTerm ? `${currentTerm.name} Schedule` : 'Loading term...'} />
        <div className="ds-card ds-toolbar">
          {/* View Toggles - Only for Admin/Teachers/Staff */}
          {['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'].includes(user?.role || '') && (
            <div className="ds-actions" role="group" aria-label="Timetable view">
              <button
                onClick={() => setViewMode('CLASS')}
                aria-pressed={viewMode === 'CLASS'}
                className={viewMode === 'CLASS' ? 'ds-button-primary' : 'ds-button-secondary'}
              >
                Class View
              </button>
              <button
                onClick={() => setViewMode('TEACHER')}
                aria-pressed={viewMode === 'TEACHER'}
                className={viewMode === 'TEACHER' ? 'ds-button-primary' : 'ds-button-secondary'}
              >
                Teacher View
              </button>
            </div>
          )}

          {viewMode === 'CLASS' ? (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                aria-label="Timetable class"
                className="ds-select w-full sm:w-auto"
              >
                <option value="">Select Class</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
          ) : (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              aria-label="Timetable teacher"
              className="ds-select w-full sm:w-auto"
            >
              <option value="">Select Teacher</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </select>
          )}

          {(user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="ds-button-primary"
              disabled={!selectedClassId && !selectedTeacherId}
            >
              <Plus size={20} aria-hidden="true" />
              Add Period
            </button>
          )}

          {/* Export Buttons */}
          {periods.length > 0 && (
            <>
              <button
                onClick={exportToCSV}
                className="ds-button-outline"
                aria-label="Export timetable to CSV"
                title="Export to CSV"
              >
                <Download size={18} aria-hidden="true" />
                CSV
              </button>
              <button
                onClick={printTimetable}
                className="ds-button-outline"
                aria-label="Print timetable or save as PDF"
                title="Print / Save as PDF"
              >
                <Printer size={18} aria-hidden="true" />
                Print
              </button>
            </>
          )}
        </div>

      {/* Timetable Grid */}
      {/* Retain the responsive day-card grid; this schedule is not a tabular data table. */}
      {loading && <p role="status" className="ds-helper">Loading timetable...</p>}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4" aria-busy={loading}>
        {DAYS.map(day => (
          <div key={day} className="ds-surface min-w-0 overflow-hidden flex flex-col h-full">
            <h2 className="bg-[var(--surface-muted)] px-4 py-3 border-b border-[var(--border-color)] text-sm text-center">
              {day}
            </h2>
            <div className="p-2 space-y-2 flex-1 min-h-[200px]">
              {getPeriodsForDay(day).length === 0 ? (
                <div className="h-full flex items-center justify-center ds-helper">
                  No classes
                </div>
              ) : (
                getPeriodsForDay(day).map(period => (
                  <div key={period.id} className="ds-surface p-3 relative">
                    <div className="flex flex-wrap justify-between items-start gap-1 mb-1">
                      <span className="ds-badge ds-badge-neutral">
                        {period.startTime} - {period.endTime}
                      </span>
                      {(user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER') && (
                        <button
                          onClick={() => handleDeletePeriod(period.id)}
                          className="ds-button-ghost"
                          aria-label={`Delete ${period.subject.name} on ${day}, ${period.startTime} to ${period.endTime}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-sm mb-1 break-words">{period.subject.name}</h3>
                    <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-1 break-words">
                      {viewMode === 'CLASS' ? (
                        <>
                          <User size={12} aria-hidden="true" />
                          {period.teacher?.fullName || 'No Teacher'}
                          {period.isCombined && (
                            <span className="ds-badge ds-badge-info">
                              Combined: {period.classNames?.join(', ')}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Users size={12} aria-hidden="true" />
                          {period.classNames?.join(', ') || 'No Classes'}
                          {period.isCombined && (
                            <span className="ds-badge ds-badge-info">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div role="dialog" aria-labelledby="timetable-period-title" className="ds-card w-full max-w-md max-h-[90dvh] overflow-y-auto">
            <h2 id="timetable-period-title" className="mb-4">Add Timetable Period</h2>
            <form onSubmit={handleAddPeriod} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="period-day" className="ds-label mb-1">Day (required)</label>
                  <select
                    id="period-day"
                    required
                    className="ds-select"
                    value={newPeriod.dayOfWeek}
                    onChange={(e) => setNewPeriod({ ...newPeriod, dayOfWeek: e.target.value })}
                  >
                    {DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="period-subject" className="ds-label mb-1">Subject (required)</label>
                  <select
                    id="period-subject"
                    required
                    className="ds-select"
                    value={newPeriod.subjectId}
                    onChange={(e) => setNewPeriod({ ...newPeriod, subjectId: e.target.value })}
                  >
                    <option value="">Select Subject</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="period-start" className="ds-label mb-1">Start Time (required)</label>
                  <input
                    id="period-start"
                    type="time"
                    required
                    className="ds-input"
                    value={newPeriod.startTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="period-end" className="ds-label mb-1">End Time (required)</label>
                  <input
                    id="period-end"
                    type="time"
                    required
                    className="ds-input"
                    value={newPeriod.endTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, endTime: e.target.value })}
                  />
                </div>
              </div>

              {viewMode === 'CLASS' ? (
                <div>
                  <p className="ds-label mb-1">Teacher</p>
                  {!newPeriod.subjectId ? (
                    <div className="ds-alert ds-badge-neutral">
                      Select a subject first
                    </div>
                  ) : (
                    <div className="ds-alert ds-badge-info">
                      <User size={16} />
                      Teacher will be auto-assigned from Subject Allocation
                    </div>
                  )}
                </div>
              ) : (
                <fieldset className="min-w-0">
                  <legend className="ds-label mb-1">
                    Classes <span className="ds-helper">(Select one or more for combined sessions)</span>
                  </legend>
                  <div className="ds-surface max-h-40 overflow-y-auto p-2 space-y-1" role="region" aria-label="Classes for this period" tabIndex={0}>
                    {classes.map(c => (
                      <label key={c.id} className="flex min-h-11 items-center gap-2 p-2 hover:bg-[var(--surface-muted)] rounded-xl cursor-pointer">
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
                          className="ds-choice"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {newPeriod.classIds.length > 1 && (
                    <p className="ds-helper mt-1 flex items-center gap-1">
                      <Users size={12} />
                      Combined session: {newPeriod.classIds.length} classes selected
                    </p>
                  )}
                </fieldset>
              )}

              <div className="ds-form-actions">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="ds-button-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ds-button-primary"
                >
                  Add Period
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
