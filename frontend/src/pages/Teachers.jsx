import React, { useState, useEffect } from 'react';
import { teachersAPI } from '../services/api';
import Loading from '../components/Loading';

const Teachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      setLoading(true);
      const response = await teachersAPI.getAll();
      setTeachers(response.data);
    } catch (err) {
      console.error('Failed to load teachers', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Teachers</h1>
            <p className="page-subtitle">{teachers.length} teachers</p>
          </div>
        </div>
      </div>

      {teachers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👨‍🏫</div>
            <div className="empty-state-text">No teachers registered yet</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher ID</th>
                  <th>Name</th>
                  <th>Subject</th>
                  <th>Email</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(teacher => (
                  <tr key={teacher._id}>
                    <td><strong>{teacher.teacherId}</strong></td>
                    <td>
                      {teacher.firstName} {teacher.lastName}
                    </td>
                    <td>{teacher.subject || 'N/A'}</td>
                    <td>{teacher.email}</td>
                    <td>{teacher.phone}</td>
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

export default Teachers;
