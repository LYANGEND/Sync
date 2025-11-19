import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { studentsAPI } from '../services/api';
import { formatDate, calculateAge } from '../utils/helpers';
import Loading from '../components/Loading';

const Students = () => {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    filterStudents();
  }, [searchTerm, classFilter, students]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await studentsAPI.getAll();
      setStudents(response.data);
      setFilteredStudents(response.data);
    } catch (err) {
      console.error('Failed to load students', err);
    } finally {
      setLoading(false);
    }
  };

  const filterStudents = () => {
    let filtered = students;

    if (searchTerm) {
      filtered = filtered.filter(student =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentId.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (classFilter) {
      filtered = filtered.filter(student => student.classLevel === classFilter);
    }

    setFilteredStudents(filtered);
  };

  if (loading) return <Loading />;

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Students</h1>
            <p className="page-subtitle">{filteredStudents.length} students enrolled</p>
          </div>
          <Link to="/students/new" className="btn btn-primary">
            ➕ Add Student
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Search</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search by name or student ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Class Level</label>
            <select
              className="form-select"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All Levels</option>
              <option value="Baby">Baby</option>
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
            </select>
          </div>
        </div>
      </div>

      {/* Students List */}
      {filteredStudents.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-text">
              {searchTerm || classFilter ? 'No students found' : 'No students enrolled yet'}
            </div>
            {!searchTerm && !classFilter && (
              <Link to="/students/new" className="btn btn-primary mt-2">
                Add First Student
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Age</th>
                  <th>Parent Contact</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => (
                  <tr key={student._id}>
                    <td><strong>{student.studentId}</strong></td>
                    <td>
                      {student.firstName} {student.lastName}
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        {student.gender}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {student.classLevel}
                      </span>
                      {' '}
                      {student.grade}
                    </td>
                    <td>{calculateAge(student.dateOfBirth)} years</td>
                    <td>
                      <div>{student.parentName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        {student.parentPhone}
                      </div>
                    </td>
                    <td>
                      <Link 
                        to={`/students/${student._id}`}
                        className="btn btn-sm btn-primary"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
