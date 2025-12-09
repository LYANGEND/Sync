import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, DollarSign, CreditCard, Calendar, BookOpen, Users, Check, GraduationCap, Edit2, Trash2 } from 'lucide-react';
import api from '../../utils/api';
import Scholarships from './Scholarships';

interface Payment {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_DEPOSIT';
  referenceNumber?: string;
  student: {
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class?: {
      id: string;
      name: string;
    };
  };
  recordedBy: {
    fullName: string;
  };
}

interface FeeTemplate {
  id: string;
  name: string;
  amount: number;
  academicTermId: string;
  applicableGrade: number;
  academicTerm: {
    name: string;
  };
}

interface AcademicTerm {
  id: string;
  name: string;
}

interface Class {
  id: string;
  name: string;
}

const getGradeLabel = (grade: number) => {
  if (grade === 0) return 'Nursery';
  return `Grade ${grade}`;
};

const Finance = () => {
  const [activeTab, setActiveTab] = useState<'payments' | 'fees' | 'scholarships'>('payments');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<{ id: string; firstName: string; lastName: string; admissionNumber: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateFeeModal, setShowCreateFeeModal] = useState(false);
  const [showAssignFeeModal, setShowAssignFeeModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    pendingFees: 0,
    overdueStudentsCount: 0
  });

  // Form states
  const [newFee, setNewFee] = useState({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
  const [editingTemplate, setEditingTemplate] = useState<FeeTemplate | null>(null);
  const [assignClassId, setAssignClassId] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    amount: '',
    method: 'CASH',
    referenceNumber: ''
  });

  useEffect(() => {
    fetchPayments();
    fetchFeeTemplates();
    fetchAcademicTerms();
    fetchClasses();
    fetchStudents();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/payments/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching finance stats:', error);
    }
  };

  const fetchPayments = async () => {
    try {
      const response = await api.get('/payments');
      setPayments(response.data);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await api.get('/students');
      setStudents(response.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchFeeTemplates = async () => {
    try {
      const response = await api.get('/fees/templates');
      setFeeTemplates(response.data);
    } catch (error) {
      console.error('Error fetching fee templates:', error);
    }
  };

  const fetchAcademicTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      setAcademicTerms(response.data);
    } catch (error) {
      console.error('Error fetching academic terms:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const handleSaveFee = async () => {
    try {
      if (editingTemplate) {
        await api.put(`/fees/templates/${editingTemplate.id}`, {
          ...newFee,
          amount: Number(newFee.amount),
          applicableGrade: Number(newFee.applicableGrade),
        });
      } else {
        await api.post('/fees/templates', {
          ...newFee,
          amount: Number(newFee.amount),
          applicableGrade: Number(newFee.applicableGrade),
        });
      }
      setShowCreateFeeModal(false);
      setEditingTemplate(null);
      setNewFee({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
      fetchFeeTemplates();
    } catch (error) {
      console.error('Error saving fee template:', error);
      alert('Failed to save fee template');
    }
  };

  const handleEditClick = (template: FeeTemplate) => {
    setEditingTemplate(template);
    setNewFee({
      name: template.name,
      amount: template.amount.toString(),
      academicTermId: template.academicTermId,
      applicableGrade: template.applicableGrade.toString(),
    });
    setShowCreateFeeModal(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this fee template?')) return;
    try {
      await api.delete(`/fees/templates/${id}`);
      fetchFeeTemplates();
    } catch (error: any) {
      console.error('Error deleting fee template:', error);
      alert(error.response?.data?.error || 'Failed to delete fee template');
    }
  };

  const handleAssignFee = async () => {
    if (!selectedTemplateId || !assignClassId) return;
    try {
      await api.post('/fees/assign-class', {
        feeTemplateId: selectedTemplateId,
        classId: assignClassId,
      });
      setShowAssignFeeModal(false);
      setAssignClassId('');
      setSelectedTemplateId(null);
      alert('Fee assigned successfully');
    } catch (error) {
      console.error('Error assigning fee:', error);
      alert('Failed to assign fee');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/payments', {
        ...paymentForm,
        amount: Number(paymentForm.amount)
      });
      setShowAddModal(false);
      setPaymentForm({ studentId: '', amount: '', method: 'CASH', referenceNumber: '' });
      fetchPayments();
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('Failed to record payment');
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch =
      payment.student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.student.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesMethod = methodFilter === 'ALL' || payment.method === methodFilter;
    const matchesClass = classFilter === 'ALL' || payment.student.class?.id === classFilter;

    const paymentDate = new Date(payment.paymentDate);
    const matchesDate =
      (!dateRange.start || paymentDate >= new Date(dateRange.start)) &&
      (!dateRange.end || paymentDate <= new Date(dateRange.end));

    return matchesSearch && matchesMethod && matchesClass && matchesDate;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Finance & Payments</h1>
          <p className="text-slate-500">Manage school fees and transactions</p>
        </div>
        <div className="flex space-x-3">
          {activeTab === 'fees' && (
            <button
              onClick={() => {
                setEditingTemplate(null);
                setNewFee({ name: '', amount: '', academicTermId: '', applicableGrade: '' });
                setShowCreateFeeModal(true);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Create Fee Template</span>
            </button>
          )}
          {activeTab === 'payments' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Record Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'payments'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Payments
        </button>
        <button
          onClick={() => setActiveTab('fees')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'fees'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Fee Structures
        </button>
        <button
          onClick={() => setActiveTab('scholarships')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scholarships'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
            }`}
        >
          Scholarships
        </button>
      </div>

      {activeTab === 'scholarships' ? (
        <Scholarships />
      ) : activeTab === 'payments' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                  <DollarSign size={24} />
                </div>
                <span className="text-sm text-slate-500">Total Revenue</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800">ZMW {stats.totalRevenue.toLocaleString()}</h3>
              <p className="text-sm text-green-600 mt-1">All time revenue</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                  <CreditCard size={24} />
                </div>
                <span className="text-sm text-slate-500">Transactions</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800">{stats.totalTransactions}</h3>
              <p className="text-sm text-slate-500 mt-1">Total transactions</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
                  <Calendar size={24} />
                </div>
                <span className="text-sm text-slate-500">Pending Fees</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-800">ZMW {stats.pendingFees.toLocaleString()}</h3>
              <p className="text-sm text-red-500 mt-1">{stats.overdueStudentsCount} students overdue</p>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by student name, ID, or reference..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <select
                  className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="ALL">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="ALL">All Methods</option>
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="BANK_DEPOSIT">Bank Deposit</option>
                </select>

                <input
                  type="date"
                  className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-600">Date</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Student</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Class</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Amount (ZMW)</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Method</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Reference</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">Loading payments...</td>
                    </tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No payments found</td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800">
                            {payment.student.firstName} {payment.student.lastName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {payment.student.admissionNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {payment.student.class?.name || 'No Class'}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800">
                          {Number(payment.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${payment.method === 'CASH' ? 'bg-green-100 text-green-800' :
                              payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'}`}>
                            {payment.method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                          {payment.referenceNumber || '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {payment.recordedBy.fullName}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeTemplates.map((template) => (
            <div key={template.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800 mb-1">{template.name}</h3>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {getGradeLabel(template.applicableGrade)}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditClick(template)}
                    className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-4">{template.academicTerm.name}</p>

              <div className="flex items-baseline mb-6">
                <span className="text-2xl font-bold text-slate-800">ZMW {Number(template.amount).toLocaleString()}</span>
              </div>

              <button
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setShowAssignFeeModal(true);
                }}
                className="w-full py-2 px-4 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
              >
                <Users size={18} />
                <span>Assign to Class</span>
              </button>
            </div>
          ))}

          {feeTemplates.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <BookOpen className="text-slate-400" size={24} />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No fee templates</h3>
              <p className="text-slate-500 mt-1">Create a fee template to get started</p>
            </div>
          )}
        </div>
      )
      }

      {/* Add Payment Modal */}
      {
        showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Record New Payment</h2>
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Student</label>
                  <select
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={paymentForm.studentId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
                  >
                    <option value="">Select Student</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} ({student.admissionNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZMW)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  >
                    <option value="CASH">Cash</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_DEPOSIT">Bank Deposit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional"
                    value={paymentForm.referenceNumber}
                    onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Create Fee Template Modal */}
      {
        showCreateFeeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">{editingTemplate ? 'Edit Fee Template' : 'Create Fee Template'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fee Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Term 1 Tuition"
                    value={newFee.name}
                    onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (ZMW)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    value={newFee.amount}
                    onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Academic Term</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newFee.academicTermId}
                    onChange={(e) => setNewFee({ ...newFee, academicTermId: e.target.value })}
                  >
                    <option value="">Select Term</option>
                    {academicTerms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Applicable Grade</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newFee.applicableGrade}
                    onChange={(e) => setNewFee({ ...newFee, applicableGrade: e.target.value })}
                  >
                    <option value="">Select Grade</option>
                    <option value="0">Nursery</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowCreateFeeModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Assign Fee Modal */}
      {
        showAssignFeeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Assign Fee to Class</h2>
              <p className="text-sm text-slate-500 mb-4">
                This will assign the selected fee to all active students in the selected class.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Class</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={assignClassId}
                    onChange={(e) => setAssignClassId(e.target.value)}
                  >
                    <option value="">Select Class</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAssignFeeModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignFee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Assign Fee
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default Finance;
