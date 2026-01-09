import React, { useState, useEffect } from 'react';
import { Calendar, User, Plus, Trash2, Users, Download, Printer } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

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
  teacherId?: string;
  teacher?: {
    id: string;
    fullName: string;
  };
}

interface AcademicTerm {
  id: string;
  name: string;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const Timetable = () => {
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
      } else if (user?.role === 'STUDENT') {
        // Should be single class (their own)
        const profileRes = await api.get('/students/profile/me');
        if (profileRes.data.class) {
          setClasses([profileRes.data.class]);
          setSelectedClassId(profileRes.data.class.id);
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
    if (!confirm('Are you sure you want to delete this period?')) return;
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="text-blue-600" />
            Class Timetable
          </h1>
          <p className="text-gray-500">
            {currentTerm ? `${currentTerm.name} Schedule` : 'Loading term...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggles - Only for Admin/Teachers/Staff */}
          {['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'].includes(user?.role || '') && (
            <div className="bg-gray-100 p-1 rounded-lg flex">
              <button
                onClick={() => setViewMode('CLASS')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'CLASS' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Class View
              </button>
              <button
                onClick={() => setViewMode('TEACHER')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'TEACHER' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Teacher View
              </button>
            </div>
          )}

          {viewMode === 'CLASS' ? (
            user?.role === 'STUDENT' && classes.length > 0 ? (
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 font-medium flex items-center gap-2">
                <span className="text-blue-500 text-xs uppercase font-bold">Your Class:</span>
                {classes[0].name}
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Select Class</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )
          ) : (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              disabled={!selectedClassId && !selectedTeacherId}
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

      {/* Timetable Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {DAYS.map(day => (
          <div key={day} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-semibold text-gray-700 text-center">
              {day}
            </div>
            <div className="p-2 space-y-2 flex-1 min-h-[200px]">
              {getPeriodsForDay(day).length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                  No classes
                </div>
              ) : (
                getPeriodsForDay(day).map(period => (
                  <div key={period.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3 hover:shadow-md transition-shadow relative group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                        {period.startTime} - {period.endTime}
                      </span>
                      {(user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER') && (
                        <button
                          onClick={() => handleDeletePeriod(period.id)}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <h4 className="font-bold text-gray-800 text-sm mb-1">{period.subject.name}</h4>
                    <div className="text-xs text-gray-600 flex items-center gap-1">
                      {viewMode === 'CLASS' ? (
                        <>
                          <User size={12} />
                          {period.teacher?.fullName || 'No Teacher'}
                          {period.isCombined && (
                            <span className="ml-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">
                              Combined: {period.classNames?.join(', ')}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Users size={12} />
                          {period.classNames?.join(', ') || 'No Classes'}
                          {period.isCombined && (
                            <span className="ml-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Timetable Period</h2>
            <form onSubmit={handleAddPeriod} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    value={newPeriod.dayOfWeek}
                    onChange={(e) => setNewPeriod({ ...newPeriod, dayOfWeek: e.target.value })}
                  >
                    {DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    value={newPeriod.startTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    value={newPeriod.endTime}
                    onChange={(e) => setNewPeriod({ ...newPeriod, endTime: e.target.value })}
                  />
                </div>
              </div>

              {viewMode === 'CLASS' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                  {(() => {
                    const selectedSubject = subjects.find(s => s.id === newPeriod.subjectId);
                    if (!newPeriod.subjectId) {
                      return (
                        <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 text-sm italic">
                          Select a subject first
                        </div>
                      );
                    }
                    if (selectedSubject?.teacher) {
                      return (
                        <div className="px-3 py-2 border border-green-200 bg-green-50 rounded-lg text-green-800 font-medium flex items-center gap-2">
                          <User size={16} />
                          {selectedSubject.teacher.fullName}
                          <span className="text-xs text-green-600 ml-auto">(Auto-assigned)</span>
                        </div>
                      );
                    }
                    return (
                      <div className="px-3 py-2 border border-yellow-200 bg-yellow-50 rounded-lg text-yellow-800 text-sm">
                        ⚠️ No teacher assigned to this subject. Please assign one in the Subjects page.
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Classes <span className="text-gray-400 text-xs">(Select one or more for combined sessions)</span>
                  </label>
                  <div className="border border-gray-300 rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                    {classes.map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
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
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {newPeriod.classIds.length > 1 && (
                    <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                      <Users size={12} />
                      Combined session: {newPeriod.classIds.length} classes selected
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
