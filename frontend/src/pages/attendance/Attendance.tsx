import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, Save, Users, CheckSquare, BarChart2 } from 'lucide-react';
import api from '../../utils/api';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

interface Class {
  id: string;
  name: string;
}

interface AttendanceRecord {
  studentId: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
}

const Attendance = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'LATE'>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await api.get('/classes');
        setClasses(response.data);
        if (response.data.length > 0) {
          setSelectedClass(response.data[0].id);
        }
      } catch (error) {
        console.error('Error fetching classes:', error);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchClasses();
  }, []);

  // Fetch students and existing attendance when class or date changes
  useEffect(() => {
    if (!selectedClass) return;
    fetchData();
  }, [selectedClass, selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch students for the selected class
      const studentsRes = await api.get(`/classes/${selectedClass}/students`);
      const classStudents = studentsRes.data;
      setStudents(classStudents);

      // Fetch existing attendance for the date
      const attendanceRes = await api.get('/attendance', {
        params: {
          classId: selectedClass,
          date: new Date(selectedDate).toISOString()
        }
      });
      
      const existingAttendance = attendanceRes.data;
      
      // Initialize attendance state
      const newAttendanceState: Record<string, 'PRESENT' | 'ABSENT' | 'LATE'> = {};
      
      classStudents.forEach((s: Student) => {
        // Check if we have a record for this student
        const record = existingAttendance.find((r: any) => r.studentId === s.id);
        
        if (record) {
          newAttendanceState[s.id] = record.status;
        } else {
          newAttendanceState[s.id] = 'PRESENT'; // Default to present
        }
      });
      
      setAttendance(newAttendanceState);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (studentId: string, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const handleMarkAllPresent = () => {
    const newAttendance = { ...attendance };
    students.forEach(s => {
      newAttendance[s.id] = 'PRESENT';
    });
    setAttendance(newAttendance);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = Object.entries(attendance).map(([studentId, status]) => ({
        studentId,
        status
      }));

      await api.post('/attendance', {
        classId: selectedClass,
        date: new Date(selectedDate).toISOString(),
        records
      });

      // Optional: Show success message
      // alert('Attendance recorded successfully!'); 
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const total = students.length;
    if (total === 0) return { present: 0, absent: 0, late: 0, presentPct: 0 };
    
    const present = Object.values(attendance).filter(s => s === 'PRESENT').length;
    const absent = Object.values(attendance).filter(s => s === 'ABSENT').length;
    const late = Object.values(attendance).filter(s => s === 'LATE').length;
    
    return {
      present,
      absent,
      late,
      presentPct: Math.round((present / total) * 100)
    };
  }, [attendance, students]);

  if (initialLoading) {
    return <div className="p-8 text-center text-slate-500">Loading classes...</div>;
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Attendance Register</h1>
          <p className="text-slate-500">Manage daily attendance records</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto bg-white p-2 rounded-lg shadow-sm border border-slate-200">
          <select 
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-4 py-2 border-r border-slate-200 focus:outline-none bg-transparent min-w-[150px]"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 focus:outline-none bg-transparent"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Students</p>
            <p className="text-2xl font-bold text-slate-800">{students.length}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Users size={20} />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">Present</p>
            <p className="text-2xl font-bold text-green-600">{stats.present}</p>
          </div>
          <div className="p-3 bg-green-50 text-green-600 rounded-lg">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">Absent</p>
            <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-lg">
            <XCircle size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">Late</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.late}</p>
          </div>
          <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">
            <Clock size={20} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50">
          <div className="flex items-center space-x-2 text-slate-600">
            <Calendar size={20} />
            <span className="font-medium">
              {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          
          <button 
            onClick={handleMarkAllPresent}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
          >
            <CheckSquare size={16} />
            <span>Mark All Present</span>
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            Loading students...
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No students found in this class.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600 w-16">#</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Student Name</th>
                  <th className="px-6 py-4 font-semibold text-slate-600">Admission No.</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((student, index) => (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-500">{index + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-sm">
                      {student.admissionNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleStatusChange(student.id, 'PRESENT')}
                          className={`p-2 rounded-lg border transition-all ${
                            attendance[student.id] === 'PRESENT' 
                              ? 'bg-green-100 border-green-300 text-green-700 ring-2 ring-green-500 ring-offset-1' 
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                          title="Present"
                        >
                          <CheckCircle size={20} />
                        </button>
                        <button
                          onClick={() => handleStatusChange(student.id, 'ABSENT')}
                          className={`p-2 rounded-lg border transition-all ${
                            attendance[student.id] === 'ABSENT' 
                              ? 'bg-red-100 border-red-300 text-red-700 ring-2 ring-red-500 ring-offset-1' 
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                          title="Absent"
                        >
                          <XCircle size={20} />
                        </button>
                        <button
                          onClick={() => handleStatusChange(student.id, 'LATE')}
                          className={`p-2 rounded-lg border transition-all ${
                            attendance[student.id] === 'LATE' 
                              ? 'bg-yellow-100 border-yellow-300 text-yellow-700 ring-2 ring-yellow-500 ring-offset-1' 
                              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                          }`}
                          title="Late"
                        >
                          <Clock size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={loading || saving || students.length === 0}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Save size={20} />
            <span>{saving ? 'Saving...' : 'Save Attendance'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
