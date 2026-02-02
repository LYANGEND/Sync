import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Search, Filter, RefreshCw, X, CheckCircle, Clock, AlertCircle, TrendingUp, Plus } from 'lucide-react';
import api from '../../utils/api';
import ExportDropdown from '../ExportDropdown';

interface MobileMoneyPayment {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  method: string;
  transactionId: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED';
  mobileMoneyOperator: string;
  mobileMoneyPhone: string;
  mobileMoneyRef: string;
  mobileMoneyStatus: string;
  mobileMoneyConfirmedAt: string | null;
  mobileMoneyFee: number | null;
  student: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    guardianPhone: string;
    class?: {
      id: string;
      name: string;
    };
  };
  recordedBy: {
    fullName: string;
  };
  branch?: {
    id: string;
    name: string;
    code: string;
  };
}

interface MobileMoneyStats {
  totalTransactions: number;
  totalAmount: number;
  totalFees: number;
  byOperator: Array<{ operator: string; count: number; amount: number }>;
  byStatus: Array<{ status: string; count: number; amount: number }>;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  guardianPhone: string;
  class?: { id: string; name: string };
}

const MobileMoneyPayments: React.FC = () => {
  const [payments, setPayments] = useState<MobileMoneyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MobileMoneyStats | null>(null);

  // Record Payment Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    amount: '',
    operator: 'mtn',
    phoneNumber: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Export data
  const [exportData, setExportData] = useState<MobileMoneyPayment[]>([]);
  const [loadingExport, setLoadingExport] = useState(false);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/payments/mobile-money', {
        params: {
          page: currentPage,
          limit: 20,
          search: searchQuery,
          operator: operatorFilter,
          status: statusFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      });

      setPayments(response.data.data);
      setStats(response.data.stats);
      setTotalPages(response.data.meta.totalPages);
      setTotalCount(response.data.meta.total);
    } catch (error) {
      console.error('Error fetching mobile money payments:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, operatorFilter, statusFilter, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchPayments]);

  const fetchExportData = async () => {
    try {
      setLoadingExport(true);
      const response = await api.get('/payments/mobile-money', {
        params: {
          exportAll: true,
          search: searchQuery,
          operator: operatorFilter,
          status: statusFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      });
      setExportData(response.data.data);
    } catch (error) {
      console.error('Error fetching export data:', error);
    } finally {
      setLoadingExport(false);
    }
  };

  useEffect(() => {
    // Fetch all data for export when filters change
    fetchExportData();
  }, [searchQuery, operatorFilter, statusFilter, startDate, endDate]);

  // Fetch students for the dropdown
  const fetchStudents = async () => {
    try {
      const response = await api.get('/students', { params: { limit: 1000 } });
      setStudents(response.data.data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // Filter students by search
  const filteredStudents = (students || []).filter(student => {
    if (!studentSearch) return true;
    const search = studentSearch.toLowerCase();
    return (
      student.firstName.toLowerCase().includes(search) ||
      student.lastName.toLowerCase().includes(search) ||
      student.admissionNumber.toLowerCase().includes(search)
    );
  });

  // Generate idempotency key to prevent duplicate submissions
  const generateIdempotencyKey = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  };

  // Handle record payment form submission
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.studentId || !paymentForm.amount) {
      alert('Please select a student and enter an amount');
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = generateIdempotencyKey();
      
      const response = await api.post('/payments', {
        studentId: paymentForm.studentId,
        amount: Number(paymentForm.amount),
        method: 'MOBILE_MONEY',
        operator: paymentForm.operator,
        phoneNumber: paymentForm.phoneNumber,
        notes: paymentForm.notes,
        idempotencyKey, // Prevent duplicate submissions
      });

      // Check if it was a duplicate
      if (response.data.duplicate) {
        alert('This payment was already processed.');
      }

      setShowAddModal(false);
      setPaymentForm({ studentId: '', amount: '', operator: 'mtn', phoneNumber: '', notes: '' });
      setStudentSearch('');
      fetchPayments();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      const errorMsg = error.response?.data?.message || 'Failed to record payment';
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Get selected student info
  const selectedStudent = students.find(s => s.id === paymentForm.studentId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
            <CheckCircle size={12} />
            Completed
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full">
            <Clock size={12} />
            Pending
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
            <AlertCircle size={12} />
            Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-full">
            <X size={12} />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-full">
            {status}
          </span>
        );
    }
  };

  const getOperatorBadge = (operator: string) => {
    if (operator === 'mtn') {
      return (
        <span className="px-2 py-1 text-xs font-medium text-yellow-800 bg-yellow-100 rounded-full">
          MTN MoMo
        </span>
      );
    }
    if (operator === 'airtel') {
      return (
        <span className="px-2 py-1 text-xs font-medium text-red-800 bg-red-100 rounded-full">
          Airtel Money
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-full">
        {operator || 'Unknown'}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency: 'ZMW',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-ZM', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setOperatorFilter('all');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const exportColumns = [
    { key: 'transactionId', header: 'Transaction ID' },
    { key: 'student.admissionNumber', header: 'Admission No' },
    { key: 'student.firstName', header: 'First Name' },
    { key: 'student.lastName', header: 'Last Name' },
    { key: 'student.class.name', header: 'Class' },
    { key: 'amount', header: 'Amount (ZMW)' },
    { key: 'mobileMoneyFee', header: 'Fee (ZMW)' },
    { key: 'mobileMoneyOperator', header: 'Operator' },
    { key: 'mobileMoneyPhone', header: 'Phone Number' },
    { key: 'mobileMoneyRef', header: 'Reference' },
    { key: 'status', header: 'Status' },
    { key: 'paymentDate', header: 'Date' },
    { key: 'recordedBy.fullName', header: 'Recorded By' },
  ];

  const mtnStats = stats?.byOperator.find(o => o.operator === 'mtn');
  const airtelStats = stats?.byOperator.find(o => o.operator === 'airtel');
  const completedStats = stats?.byStatus.find(s => s.status === 'COMPLETED');
  const pendingStats = stats?.byStatus.find(s => s.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Transactions</p>
              <p className="text-2xl font-bold text-slate-800">{stats?.totalTransactions || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Smartphone className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Amount</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats?.totalAmount || 0)}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <TrendingUp className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">MTN MoMo</p>
              <p className="text-xl font-bold text-yellow-600">
                {mtnStats?.count || 0} txns
              </p>
              <p className="text-sm text-slate-500">{formatCurrency(mtnStats?.amount || 0)}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Smartphone className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Airtel Money</p>
              <p className="text-xl font-bold text-red-600">
                {airtelStats?.count || 0} txns
              </p>
              <p className="text-sm text-slate-500">{formatCurrency(airtelStats?.amount || 0)}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <Smartphone className="text-red-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle size={16} className="text-green-600" />
          <span className="text-sm font-medium text-green-700">
            Completed: {completedStats?.count || 0} ({formatCurrency(completedStats?.amount || 0)})
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-200">
          <Clock size={16} className="text-yellow-600" />
          <span className="text-sm font-medium text-yellow-700">
            Pending: {pendingStats?.count || 0} ({formatCurrency(pendingStats?.amount || 0)})
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
          <Smartphone size={16} className="text-slate-600" />
          <span className="text-sm font-medium text-slate-700">
            Total Fees Collected: {formatCurrency(stats?.totalFees || 0)}
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by student, phone, transaction ID, reference..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter size={18} />
              Filters
            </button>

            <button
              onClick={() => {
                setCurrentPage(1);
                fetchPayments();
              }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Record Payment
            </button>

            <ExportDropdown
              data={exportData}
              columns={exportColumns}
              filename={`mobile-money-payments-${new Date().toISOString().split('T')[0]}`}
              disabled={loadingExport || exportData.length === 0}
            />
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Operator</label>
                <select
                  value={operatorFilter}
                  onChange={(e) => {
                    setOperatorFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Operators</option>
                  <option value="mtn">MTN MoMo</option>
                  <option value="airtel">Airtel Money</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800"
              >
                <X size={16} />
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="animate-spin text-blue-600" size={32} />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12">
            <Smartphone className="mx-auto text-slate-300" size={48} />
            <p className="mt-4 text-slate-500">No mobile money payments found</p>
            {(searchQuery || operatorFilter !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
              <button
                onClick={clearFilters}
                className="mt-2 text-blue-600 hover:text-blue-700"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Operator</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Phone</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Fee</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Reference</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{formatDate(payment.paymentDate)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-800">
                            {payment.student.firstName} {payment.student.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{payment.student.admissionNumber}</p>
                          {payment.student.class && (
                            <p className="text-xs text-slate-400">{payment.student.class.name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getOperatorBadge(payment.mobileMoneyOperator)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{payment.mobileMoneyPhone || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-slate-800">{formatCurrency(payment.amount)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-slate-500">
                          {payment.mobileMoneyFee ? formatCurrency(payment.mobileMoneyFee) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(payment.status)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-slate-600">
                          {payment.mobileMoneyRef || payment.transactionId}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{payment.recordedBy?.fullName || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-600">
                Showing {(currentPage - 1) * 20 + 1} - {Math.min(currentPage * 20, totalCount)} of {totalCount} payments
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Record Mobile Money Payment</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-4 space-y-4">
              {/* Student Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Student <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Search by name or admission number..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {studentSearch && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                    {filteredStudents.slice(0, 10).map(student => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => {
                          setPaymentForm(prev => ({ 
                            ...prev, 
                            studentId: student.id,
                            phoneNumber: student.guardianPhone || ''
                          }));
                          setStudentSearch('');
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <p className="font-medium text-slate-800">{student.firstName} {student.lastName}</p>
                        <p className="text-xs text-slate-500">{student.admissionNumber} • {student.class?.name || 'No class'}</p>
                      </button>
                    ))}
                    {filteredStudents.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-500">No students found</p>
                    )}
                  </div>
                )}
                {selectedStudent && !studentSearch && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-blue-800">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                        <p className="text-xs text-blue-600">{selectedStudent.admissionNumber} • {selectedStudent.class?.name || 'No class'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPaymentForm(prev => ({ ...prev, studentId: '', phoneNumber: '' }))}
                        className="p-1 hover:bg-blue-100 rounded"
                      >
                        <X size={16} className="text-blue-600" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount (ZMW) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="Enter amount"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {paymentForm.amount && Number(paymentForm.amount) > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Fee (2.5%): K{(Number(paymentForm.amount) * 0.025).toFixed(2)} • Total: K{(Number(paymentForm.amount) * 1.025).toFixed(2)}
                  </p>
                )}
              </div>

              {/* Operator */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mobile Money Operator <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentForm(prev => ({ ...prev, operator: 'mtn' }))}
                    className={`p-3 border rounded-lg flex items-center justify-center gap-2 transition-colors ${
                      paymentForm.operator === 'mtn'
                        ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone size={18} />
                    <span className="font-medium">MTN MoMo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentForm(prev => ({ ...prev, operator: 'airtel' }))}
                    className={`p-3 border rounded-lg flex items-center justify-center gap-2 transition-colors ${
                      paymentForm.operator === 'airtel'
                        ? 'bg-red-50 border-red-400 text-red-800'
                        : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Smartphone size={18} />
                    <span className="font-medium">Airtel Money</span>
                  </button>
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={paymentForm.phoneNumber}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="e.g., 0971234567"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-slate-500">
                  A payment prompt will be sent to this number
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !paymentForm.studentId || !paymentForm.amount || !paymentForm.phoneNumber}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Smartphone size={16} />
                      Send Payment Prompt
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileMoneyPayments;
