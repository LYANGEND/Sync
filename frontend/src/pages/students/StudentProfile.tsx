import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
  User,
  CreditCard,
  Calendar,
  Phone,
  MapPin,
  ArrowLeft,
  DollarSign,
  Clock,
  FileText,
  Edit2,
  History,
  GraduationCap,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Payment {
  id: string;
  amount: string;
  paymentDate: string;
  method: string;
  transactionId?: string;
  status?: string;
}

interface ClassMovement {
  id: string;
  fromClass: { name: string } | null;
  toClass: { name: string };
  reason: string;
  changedBy: { fullName: string } | null;
  createdAt: string;
}

interface FeeStructure {
  id: string;
  amountDue: string;
  amountPaid: string;
  feeTemplate: {
    name: string;
  };
}

interface Scholarship {
  id: string;
  name: string;
  percentage: number;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  class: {
    name: string;
  };
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  address: string;
  status: string;
  scholarshipId?: string;
  scholarship?: Scholarship;
  payments: Payment[];
  feeStructures: FeeStructure[];
  classMovements: ClassMovement[];
}

const StudentProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showScholarshipModal, setShowScholarshipModal] = useState(false);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'CASH',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchStudent = async () => {
    try {
      const response = await api.get(`/students/${id}`);
      setStudent(response.data);
    } catch (error) {
      console.error('Failed to fetch student details', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScholarships = async () => {
    try {
      const response = await api.get('/scholarships');
      setScholarships(response.data);
    } catch (error) {
      console.error('Failed to fetch scholarships', error);
    }
  };

  useEffect(() => {
    if (id) {
      fetchStudent();
      fetchScholarships();
    }
  }, [id]);

  const handleScholarshipUpdate = async (scholarshipId: string | null) => {
    if (!student) return;
    try {
      await api.put(`/students/${student.id}`, { scholarshipId });
      setShowScholarshipModal(false);
      fetchStudent();
    } catch (error) {
      console.error('Failed to update scholarship', error);
      alert('Failed to update scholarship');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || submitting) return;

    setSubmitting(true);
    try {
      await api.post('/payments', {
        studentId: student.id,
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes
      });

      closePaymentModal();
      fetchStudent(); // Refresh data
    } catch (error: any) {
      console.error('Failed to record payment', error);
      alert(error.response?.data?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentForm({ amount: '', method: 'CASH', notes: '' });
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!student) return;
    try {
      await api.put(`/students/${student.id}`, { status: newStatus });
      setShowStatusModal(false);
      fetchStudent();
    } catch (error) {
      console.error('Failed to update status', error);
      alert('Failed to update status');
    }
  };

  const handleDownloadStatement = async () => {
    if (!student) return;
    try {
      const res = await api.get(`/fees/statement/${student.id}`);
      const { school, student: studentInfo, transactions } = res.data;

      const doc = new jsPDF();

      // HEADER
      doc.setFillColor(30, 41, 59); // Slate 900

      // Calculate Header Text Height
      doc.setFontSize(16);
      doc.setFont('times', 'bold');
      const schoolNameLines = doc.splitTextToSize(school.name, 110);
      const nameHeight = schoolNameLines.length * 7; // ~7mm per line
      const headerHeight = Math.max(45, 15 + nameHeight + 15); // Adjust height dynamically

      doc.rect(0, 0, 210, headerHeight, 'F');

      doc.setTextColor(255, 255, 255);

      // School Name
      doc.text(schoolNameLines, 14, 18); // Y=18 baseline

      // Address
      const addressY = 18 + nameHeight - 2; // Below name with slight offset
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(school.address || '', 14, addressY);
      doc.text(`Email: ${school.email}`, 14, addressY + 6);

      // Statement Title (Right Aligned)
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('STATEMENT OF ACCOUNT', 196, 18, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 196, 26, { align: 'right' });

      // STUDENT INFO
      const contentStartY = headerHeight + 15;

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`Student: ${studentInfo.name}`, 14, contentStartY);
      doc.text(`Admission No: ${studentInfo.admissionNumber}`, 14, contentStartY + 6);
      doc.text(`Class: ${studentInfo.className}`, 14, contentStartY + 12);

      doc.text(`Guardian: ${studentInfo.guardian || 'N/A'}`, 120, contentStartY);

      // SUMMARY BLOCK
      const totalBilled = transactions.reduce((acc: number, t: any) => t.type === 'DEBIT' ? acc + Number(t.amount) : acc, 0);
      const totalPaid = transactions.reduce((acc: number, t: any) => t.type === 'CREDIT' ? acc + Number(t.amount) : acc, 0);
      const currentBalance = totalBilled - totalPaid;

      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.roundedRect(14, contentStartY + 18, 182, 18, 2, 2, 'FD');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text('TOTAL BILLED', 30, contentStartY + 24);
      doc.text('TOTAL PAID', 95, contentStartY + 24);
      doc.text('BALANCE DUE', 160, contentStartY + 24);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(`ZMW ${totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 30, contentStartY + 31);
      doc.text(`ZMW ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 95, contentStartY + 31);

      if (currentBalance > 0) doc.setTextColor(220, 38, 38); // Red
      else doc.setTextColor(22, 163, 74); // Green
      doc.text(`ZMW ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 160, contentStartY + 31);

      let balance = 0;
      const rows = transactions.map((t: any) => {
        if (t.type === 'DEBIT') balance += t.amount;
        else balance -= t.amount;

        return [
          new Date(t.date).toLocaleDateString(),
          t.description,
          t.ref,
          t.type === 'DEBIT' ? Number(t.amount).toFixed(2) : '-',
          t.type === 'CREDIT' ? Number(t.amount).toFixed(2) : '-',
          balance.toFixed(2)
        ];
      });

      autoTable(doc, {
        startY: contentStartY + 45,
        head: [['Date', 'Description', 'Ref', 'Billed', 'Paid', 'Balance']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105], textColor: 255 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' }
        }
      });

      // FOOTER SUMMARY
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`Closing Balance: ZMW ${balance.toFixed(2)}`, 196, finalY, { align: 'right' });

      if (balance > 0) {
        doc.setTextColor(220, 38, 38); // Red
        doc.text('Please ensure outstanding fees are cleared promptly.', 14, finalY);
      } else {
        doc.setTextColor(22, 163, 74); // Green
        doc.text('Account is in good standing.', 14, finalY);
      }

      doc.save(`${studentInfo.name.replace(' ', '_')}_Statement.pdf`);

    } catch (error) {
      console.error('Failed to download statement', error);
      alert('Failed to download statement');
    }
  };

  if (loading) {
    return <div className="p-6 text-center">Loading profile...</div>;
  }

  if (!student) {
    return <div className="p-6 text-center">Student not found</div>;
  }

  // Calculate Financials
  const totalBilled = student.feeStructures.reduce((sum, fee) => sum + Number(fee.amountDue), 0);
  const totalPaid = student.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = totalBilled - totalPaid;
  const isCredit = balance < 0;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      <button
        onClick={() => navigate('/students')}
        className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Students
      </button>

      {/* Header Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-2xl font-bold">
              {student.firstName[0]}{student.lastName[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{student.firstName} {student.lastName}</h1>
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mt-1">
                <span className="font-mono bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-sm">{student.admissionNumber}</span>
                <span>•</span>
                <span>{student.class?.name || 'No Class'}</span>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${student.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>
                    {student.status}
                  </span>
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                    title="Change Status"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadStatement}
              className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Statement
            </button>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <CreditCard size={18} />
              Record Payment
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Personal Info */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <User size={20} className="text-gray-400" />
              Personal Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Guardian</label>
                <p className="text-gray-900 dark:text-white font-medium">{student.guardianName}</p>
                {student.guardianEmail && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{student.guardianEmail}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contact</label>
                <div className="flex items-center gap-2 mt-1">
                  <Phone size={16} className="text-gray-400" />
                  <p className="text-gray-900 dark:text-white">{student.guardianPhone}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Address</label>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin size={16} className="text-gray-400 mt-0.5" />
                  <p className="text-gray-900 dark:text-white">{student.address || 'No address recorded'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date of Birth</label>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar size={16} className="text-gray-400" />
                  <p className="text-gray-900 dark:text-white">{new Date(student.dateOfBirth).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Scholarship</label>
                  <button
                    onClick={() => setShowScholarshipModal(true)}
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    {student.scholarship ? 'Change' : 'Add'}
                  </button>
                </div>
                {student.scholarship ? (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 font-medium mb-1">
                      <GraduationCap size={16} />
                      {student.scholarship.name}
                    </div>
                    <p className="text-sm text-purple-600 dark:text-purple-400">{student.scholarship.percentage}% Discount</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No scholarship assigned</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Financials & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Financial Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <FileText size={18} />
                <span className="text-sm font-medium">Total Billed</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">ZMW {totalBilled.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                <DollarSign size={18} />
                <span className="text-sm font-medium">Total Paid</span>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">ZMW {totalPaid.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
              <div className={`flex items-center gap-2 ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} mb-2`}>
                <Clock size={18} />
                <span className="text-sm font-medium">{isCredit ? 'Credit Balance' : 'Balance Due'}</span>
              </div>
              <p className={`text-2xl font-bold ${isCredit ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                ZMW {Math.abs(balance).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Fee Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <FileText size={20} className="text-gray-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Fee Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fee Name</th>
                    <th className="px-6 py-3 font-medium text-right">Amount Due</th>
                    <th className="px-6 py-3 font-medium text-right">Amount Paid</th>
                    <th className="px-6 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {student.feeStructures.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No fees assigned</td>
                    </tr>
                  ) : (
                    student.feeStructures.map((fee) => (
                      <tr key={fee.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 text-gray-900 dark:text-white font-medium">
                          {fee.feeTemplate.name}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-900 dark:text-white">
                          ZMW {Number(fee.amountDue).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right text-green-600 dark:text-green-400">
                          ZMW {Number(fee.amountPaid).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                          ZMW {(Number(fee.amountDue) - Number(fee.amountPaid)).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Payment History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Method</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {student.payments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No payments recorded</td>
                    </tr>
                  ) : (
                    student.payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {new Date(payment.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400 capitalize">
                          {payment.method.replace('_', ' ').toLowerCase()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${payment.status === 'COMPLETED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'}`}>
                            {payment.status || 'COMPLETED'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">
                          ZMW {Number(payment.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Class History */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <History size={20} className="text-gray-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Class History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">From</th>
                    <th className="px-6 py-3 font-medium">To</th>
                    <th className="px-6 py-3 font-medium">Reason</th>
                    <th className="px-6 py-3 font-medium">Changed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {student.classMovements?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No class movements recorded</td>
                    </tr>
                  ) : (
                    student.classMovements?.map((movement) => (
                      <tr key={movement.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 text-gray-900 dark:text-white">
                          {new Date(movement.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {movement.fromClass?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white font-medium">
                          {movement.toClass.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {movement.reason || '-'}
                        </td>
                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs">
                          {movement.changedBy?.fullName || 'System'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold dark:text-white mb-4">Update Status</h2>
            <div className="space-y-2">
              {['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT'].map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${student.status === status
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  <div className="font-medium">{status}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowStatusModal(false)}
              className="mt-4 w-full px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showScholarshipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold dark:text-white mb-4">Assign Scholarship</h2>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              <button
                onClick={() => handleScholarshipUpdate(null)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${!student.scholarshipId
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
                  }`}
              >
                <div className="font-medium">None</div>
                <div className="text-xs opacity-75">Remove scholarship</div>
              </button>

              {scholarships.map((scholarship) => (
                <button
                  key={scholarship.id}
                  onClick={() => handleScholarshipUpdate(scholarship.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${student.scholarshipId === scholarship.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  <div className="font-medium">{scholarship.name}</div>
                  <div className="text-xs opacity-75">{scholarship.percentage}% Discount</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowScholarshipModal(false)}
              className="mt-4 w-full px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Record Payment</h2>
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              {/* Student Info Banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {student.firstName[0]}{student.lastName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{student.firstName} {student.lastName}</p>
                    <p className="text-sm text-slate-500">
                      {student.admissionNumber} • Balance:
                      <span className={balance > 0 ? 'text-red-600 font-medium ml-1' : 'text-green-600 font-medium ml-1'}>
                        ZMW {Math.abs(balance).toLocaleString()}
                      </span>
                    </p>
                  </div>
                </div>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional notes about this payment"
                  rows={2}
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 ${submitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {submitting ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentProfile;
