import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { classesAPI } from '../services/api';
import Loading from '../components/Loading';

const Classes = () => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await classesAPI.getAll();
      setClasses(response.data);
    } catch (err) {
      console.error('Failed to load classes', err);
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
            <h1 className="page-title">Classes</h1>
            <p className="page-subtitle">{classes.length} classes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {classes.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="empty-state">
              <div className="empty-state-icon">🏫</div>
              <div className="empty-state-text">No classes created yet</div>
            </div>
          </div>
        ) : (
          classes.map(cls => (
            <div key={cls._id} className="card">
              <h3 style={{ marginBottom: '0.5rem' }}>{cls.name}</h3>
              <div style={{ color: '#666', marginBottom: '1rem' }}>
                <div>{cls.classLevel} - {cls.grade}</div>
                {cls.teacher && (
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    Teacher: {cls.teacher.firstName} {cls.teacher.lastName}
                  </div>
                )}
              </div>
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#666' }}>
                  Capacity: {cls.capacity} students
                </div>
                {cls.room && (
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    Room: {cls.room}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Classes;
