import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { paymentsAPI, studentsAPI, attendanceAPI } from '../services/api';
import { formatCurrency, getCurrentTerm, getCurrentAcademicYear } from '../utils/helpers';
import Loading from '../components/Loading';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const term = getCurrentTerm();
      const academicYear = getCurrentAcademicYear();

      const [paymentStats, students, attendanceStats] = await Promise.all([
        paymentsAPI.getStats({ term, academicYear }),
        studentsAPI.getAll(),
        attendanceAPI.getStats({ 
          startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(),
          endDate: new Date().toISOString()
        })
      ]);

      setStats({
        payment: paymentStats.data,
        totalStudents: students.data.length,
        attendance: attendanceStats.data
      });
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {getCurrentTerm()} - {getCurrentAcademicYear()}
        </p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* Quick Stats */}
          <div className="grid grid-3 mb-4">
            <div className="stats-card">
              <div className="stats-card-label">Total Students</div>
              <div className="stats-card-value">{stats.totalStudents}</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-label">Total Collected</div>
              <div className="stats-card-value">
                {formatCurrency(stats.payment.totalPaid)}
              </div>
            </div>
            <div className="stats-card">
              <div className="stats-card-label">Outstanding</div>
              <div className="stats-card-value" style={{ color: '#e74c3c' }}>
                {formatCurrency(stats.payment.totalOwed)}
              </div>
            </div>
          </div>

          {/* Payment Statistics */}
          <div className="card mb-3">
            <div className="card-header">Payment Overview</div>
            <div className="grid grid-3">
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#27ae60' }}>
                  {stats.payment.paidCount}
                </div>
                <div style={{ color: '#666' }}>Fully Paid</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f39c12' }}>
                  {stats.payment.partialCount}
                </div>
                <div style={{ color: '#666' }}>Partial Payment</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#e74c3c' }}>
                  {stats.payment.pendingCount}
                </div>
                <div style={{ color: '#666' }}>Pending</div>
              </div>
            </div>
          </div>

          {/* Attendance Statistics */}
          <div className="card mb-3">
            <div className="card-header">Attendance Overview (Last 30 Days)</div>
            <div className="grid grid-2">
              <div style={{ padding: '1rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {stats.attendance.attendanceRate}%
                </div>
                <div style={{ color: '#666' }}>Attendance Rate</div>
              </div>
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '1rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#27ae60' }}>
                      {stats.attendance.present}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>Present</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#e74c3c' }}>
                      {stats.attendance.absent}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>Absent</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f39c12' }}>
                      {stats.attendance.late}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>Late</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">Quick Actions</div>
            <div className="grid grid-2">
              <Link to="/students/new" className="btn btn-primary btn-lg">
                ➕ Add New Student
              </Link>
              <Link to="/attendance" className="btn btn-success btn-lg">
                ✓ Mark Attendance
              </Link>
              <Link to="/payments" className="btn btn-warning btn-lg">
                💰 Record Payment
              </Link>
              <Link to="/payments/owing" className="btn btn-danger btn-lg">
                📊 Students Owing
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
