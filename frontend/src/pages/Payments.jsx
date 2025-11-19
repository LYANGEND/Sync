import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { paymentsAPI } from '../services/api';
import { formatCurrency, formatDate } from '../utils/helpers';
import PaymentStatusBadge from '../components/PaymentStatusBadge';
import Loading from '../components/Loading';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchPayments();
  }, [statusFilter]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = statusFilter ? { status: statusFilter } : {};
      const response = await paymentsAPI.getAll(params);
      setPayments(response.data);
    } catch (err) {
      console.error('Failed to load payments', err);
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
            <h1 className="page-title">Payments</h1>
            <p className="page-subtitle">{payments.length} payment records</p>
          </div>
          <Link to="/payments/owing" className="btn btn-danger">
            Students Owing
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="form-group">
          <label className="form-label">Filter by Status</label>
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Payments List */}
      {payments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-text">No payment records found</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Term</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment._id}>
                    <td>{formatDate(payment.paymentDate)}</td>
                    <td>
                      {payment.student.firstName} {payment.student.lastName}
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        {payment.student.studentId}
                      </div>
                    </td>
                    <td>{payment.paymentType}</td>
                    <td>{payment.term}</td>
                    <td>{formatCurrency(payment.amount)}</td>
                    <td style={{ color: '#27ae60', fontWeight: '600' }}>
                      {formatCurrency(payment.paidAmount)}
                    </td>
                    <td style={{ color: payment.balanceOwed > 0 ? '#e74c3c' : '#27ae60', fontWeight: '600' }}>
                      {formatCurrency(payment.balanceOwed)}
                    </td>
                    <td>
                      <PaymentStatusBadge status={payment.status} />
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

export default Payments;
