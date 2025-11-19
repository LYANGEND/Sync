import React, { useState, useEffect } from 'react';
import { classesAPI, attendanceAPI } from '../services/api';
import { formatDate, formatDateForInput } from '../utils/helpers';
import AttendanceStatusBadge from '../components/AttendanceStatusBadge';
import Loading from '../components/Loading';

const Attendance = () => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(formatDateForInput(new Date()));
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchClassStudents();
    }
  }, [selectedClass, attendanceDate]);

  const fetchClasses = async () => {
    try {
      const response = await classesAPI.getAll();
      setClasses(response.data);
    } catch (err) {
      console.error('Failed to load classes', err);
    }
  };

  const fetchClassStudents = async () => {
    try {
      setLoading(true);
      const response = await classesAPI.getStudents(selectedClass);
      setStudents(response.data);

      // Fetch existing attendance for this date
      const attendanceResponse = await attendanceAPI.getAll({
        class: selectedClass,
        date: attendanceDate
      });

      const attendanceMap = {};
      attendanceResponse.data.forEach(record => {
        attendanceMap[record.student._id] = record.status;
      });
      setAttendance(attendanceMap);
    } catch (err) {
      console.error('Failed to load students', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickMark = (studentId, status) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === status ? null : status
    }));
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const attendanceRecords = Object.entries(attendance)
        .filter(([_, status]) => status !== null)
        .map(([studentId, status]) => ({
          student: studentId,
          status,
          date: attendanceDate,
          class: selectedClass
        }));

      if (attendanceRecords.length === 0) {
        setMessage({ type: 'error', text: 'Please mark at least one student' });
        return;
      }

      await attendanceAPI.bulkMark({ attendanceRecords });
      setMessage({ type: 'success', text: 'Attendance saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save attendance' });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const markAllPresent = () => {
    const newAttendance = {};
    students.forEach(student => {
      newAttendance[student._id] = 'Present';
    });
    setAttendance(newAttendance);
  };

  const clearAll = () => {
    setAttendance({});
  };

  const getStatusCounts = () => {
    const counts = {
      Present: 0,
      Absent: 0,
      Late: 0,
      Excused: 0,
      Unmarked: 0
    };

    students.forEach(student => {
      const status = attendance[student._id];
      if (status) {
        counts[status]++;
      } else {
        counts.Unmarked++;
      }
    });

    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <p className="page-subtitle">One-tap attendance marking</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-3">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Class</label>
            <select 
              className="form-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">Select a class</option>
              {classes.map(cls => (
                <option key={cls._id} value={cls._id}>
                  {cls.name} ({cls.classLevel} - {cls.grade})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input 
              type="date"
              className="form-control"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {selectedClass && !loading && (
        <>
          {/* Status Summary */}
          <div className="card mb-3">
            <div className="flex flex-wrap gap-2">
              <div style={{ flex: '1 1 auto', textAlign: 'center', padding: '0.5rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#27ae60' }}>
                  {statusCounts.Present}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>Present</div>
              </div>
              <div style={{ flex: '1 1 auto', textAlign: 'center', padding: '0.5rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#e74c3c' }}>
                  {statusCounts.Absent}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>Absent</div>
              </div>
              <div style={{ flex: '1 1 auto', textAlign: 'center', padding: '0.5rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f39c12' }}>
                  {statusCounts.Late}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>Late</div>
              </div>
              <div style={{ flex: '1 1 auto', textAlign: 'center', padding: '0.5rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3498db' }}>
                  {statusCounts.Excused}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>Excused</div>
              </div>
              <div style={{ flex: '1 1 auto', textAlign: 'center', padding: '0.5rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#95a5a6' }}>
                  {statusCounts.Unmarked}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>Unmarked</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card mb-3">
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={markAllPresent}
                className="btn btn-success"
              >
                ✓ Mark All Present
              </button>
              <button 
                onClick={clearAll}
                className="btn btn-secondary"
                style={{ backgroundColor: '#95a5a6', color: 'white' }}
              >
                Clear All
              </button>
              <button 
                onClick={handleSaveAttendance}
                className="btn btn-primary"
                disabled={saving}
                style={{ marginLeft: 'auto' }}
              >
                {saving ? 'Saving...' : '💾 Save Attendance'}
              </button>
            </div>
          </div>

          {/* Student List */}
          <div className="card">
            <div className="card-header">
              Students ({students.length})
            </div>
            {students.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-text">No students in this class</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', padding: '1rem' }}>
                {students.map(student => (
                  <div 
                    key={student._id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem',
                      background: attendance[student._id] ? '#f8f9fa' : 'white',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        {student.firstName} {student.lastName}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        {student.studentId}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleQuickMark(student._id, 'Present')}
                        className={`btn btn-sm ${attendance[student._id] === 'Present' ? 'btn-success' : ''}`}
                        style={{
                          backgroundColor: attendance[student._id] === 'Present' ? '#27ae60' : '#e8e8e8',
                          color: attendance[student._id] === 'Present' ? 'white' : '#333',
                          minWidth: '70px'
                        }}
                      >
                        ✓ Present
                      </button>
                      <button
                        onClick={() => handleQuickMark(student._id, 'Absent')}
                        className={`btn btn-sm ${attendance[student._id] === 'Absent' ? 'btn-danger' : ''}`}
                        style={{
                          backgroundColor: attendance[student._id] === 'Absent' ? '#e74c3c' : '#e8e8e8',
                          color: attendance[student._id] === 'Absent' ? 'white' : '#333',
                          minWidth: '70px'
                        }}
                      >
                        ✗ Absent
                      </button>
                      <button
                        onClick={() => handleQuickMark(student._id, 'Late')}
                        className={`btn btn-sm ${attendance[student._id] === 'Late' ? 'btn-warning' : ''}`}
                        style={{
                          backgroundColor: attendance[student._id] === 'Late' ? '#f39c12' : '#e8e8e8',
                          color: attendance[student._id] === 'Late' ? 'white' : '#333',
                          minWidth: '70px'
                        }}
                      >
                        ⏰ Late
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {loading && <Loading />}

      {!selectedClass && !loading && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">Select a class to mark attendance</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
