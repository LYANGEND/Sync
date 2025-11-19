import React, { useState, useEffect } from 'react';
import { paymentsAPI } from '../services/api';
import { formatCurrency, getCurrentTerm, getCurrentAcademicYear } from '../utils/helpers';
import Loading from '../components/Loading';

const StudentsOwing = () => {
  const [studentsOwing, setStudentsOwing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [term, setTerm] = useState(getCurrentTerm());
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  useEffect(() => {
    fetchStudentsOwing();
  }, [term, academicYear]);

  const fetchStudentsOwing = async () => {
    try {
      setLoading(true);
      const response = await paymentsAPI.getOwing({ term, academicYear });
      setStudentsOwing(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load students owing');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalOwed = studentsOwing.reduce((sum, s) => sum + s.totalOwed, 0);

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="page-header">
        <h1 className="page-title">Students Owing</h1>
        <p className="page-subtitle">Track outstanding school fees</p>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Term</label>
            <select 
              className="form-select" 
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            >
              <option value="Term 1">Term 1</option>
              <option value="Term 2">Term 2</option>
              <option value="Term 3">Term 3</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Academic Year</label>
            <select 
              className="form-select"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            >
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* Summary Card */}
          <div className="card mb-3" style={{ background: '#fff3cd', borderLeft: '4px solid #f39c12' }}>
            <div className="flex justify-between align-center">
              <div>
                <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>Total Outstanding</h3>
                <p style={{ margin: 0, color: '#666' }}>
                  {studentsOwing.length} {studentsOwing.length === 1 ? 'student' : 'students'} with outstanding fees
                </p>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>
                {formatCurrency(totalOwed)}
              </div>
            </div>
          </div>

          {/* Students List */}
          {studentsOwing.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">✓</div>
                <div className="empty-state-text">
                  No outstanding payments for {term}, {academicYear}
                </div>
                <p style={{ color: '#666' }}>All students have cleared their fees!</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">Outstanding Payments</div>
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Parent Contact</th>
                      <th>Amount Owed</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsOwing.map((item) => (
                      <tr key={item.student._id}>
                        <td>{item.student.studentId}</td>
                        <td>
                          <strong>
                            {item.student.firstName} {item.student.lastName}
                          </strong>
                        </td>
                        <td>
                          {item.student.classLevel} - {item.student.grade}
                        </td>
                        <td>
                          <div>{item.student.parentName}</div>
                          <div style={{ fontSize: '0.875rem', color: '#666' }}>
                            {item.student.parentPhone}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: '#e74c3c', fontSize: '1.125rem' }}>
                            {formatCurrency(item.totalOwed)}
                          </strong>
                        </td>
                        <td>
                          <a 
                            href={`tel:${item.student.parentPhone}`}
                            className="btn btn-sm btn-primary"
                            style={{ textDecoration: 'none' }}
                          >
                            📞 Call
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentsOwing;
