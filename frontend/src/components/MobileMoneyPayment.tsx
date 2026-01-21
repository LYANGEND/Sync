import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, X, Send, Phone, Eye } from 'lucide-react';
import api from '../utils/api';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    guardianPhone?: string;
    class?: {
        id: string;
        name: string;
    };
}

interface MobileMoneyCollection {
    id: string;
    reference: string;
    lencoReference?: string;
    amount: number;
    phone: string;
    country: string;
    operator: string;
    status: 'PENDING' | 'PAY_OFFLINE' | 'SUCCESSFUL' | 'FAILED';
    reasonForFailure?: string;
    initiatedAt: string;
    completedAt?: string;
    student: {
        firstName: string;
        lastName: string;
        admissionNumber: string;
    };
    payment?: {
        id: string;
        transactionId: string;
    };
}

interface MobileMoneyPaymentProps {
    students: Student[];
    onPaymentSuccess?: () => void;
}

const MobileMoneyPayment: React.FC<MobileMoneyPaymentProps> = ({ students, onPaymentSuccess }) => {
    const [collections, setCollections] = useState<MobileMoneyCollection[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInitiateModal, setShowInitiateModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
    const [selectedCollection, setSelectedCollection] = useState<MobileMoneyCollection | null>(null);

    // Form state
    const [form, setForm] = useState({
        studentId: '',
        amount: '',
        phone: '',
        country: 'zm',
        operator: 'airtel',
    });

    // Status filter
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    useEffect(() => {
        fetchCollections();
    }, []);

    const fetchCollections = async () => {
        try {
            setLoading(true);
            const response = await api.get('/payments/mobile-money');
            setCollections(response.data.data || []);
        } catch (error) {
            console.error('Error fetching mobile money collections:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInitiatePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;

        setSubmitting(true);
        try {
            const response = await api.post('/payments/mobile-money/initiate', {
                studentId: form.studentId,
                amount: Number(form.amount),
                phone: form.phone,
                country: form.country,
                operator: form.operator,
            });

            alert(
                `✅ ${response.data.message}\n\n` +
                `Reference: ${response.data.collection.reference}\n` +
                `Amount: ZMW ${response.data.collection.amount}\n\n` +
                `The customer should authorize the payment on their phone.`
            );

            setShowInitiateModal(false);
            setForm({ studentId: '', amount: '', phone: '', country: 'zm', operator: 'airtel' });
            fetchCollections();
        } catch (error: any) {
            console.error('Error initiating mobile money payment:', error);
            alert(error.response?.data?.error || error.response?.data?.message || 'Failed to initiate payment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckStatus = async (reference: string) => {
        setCheckingStatus(reference);
        try {
            const response = await api.get(`/payments/mobile-money/status/${reference}`);
            const collection = response.data.collection;

            if (collection.status === 'SUCCESSFUL') {
                alert(`✅ Payment completed successfully!\n\nTransaction ID: ${collection.payment?.transactionId || 'N/A'}`);
                fetchCollections();
                onPaymentSuccess?.();
            } else if (collection.status === 'FAILED') {
                alert(`❌ Payment failed: ${collection.reasonForFailure || 'Unknown error'}`);
                fetchCollections();
            } else {
                alert(`⏳ Payment still pending.\n\nStatus: ${collection.status.replace('_', ' ')}\n\nThe customer needs to authorize the payment on their phone.`);
            }
        } catch (error: any) {
            console.error('Error checking status:', error);
            alert('Failed to check payment status');
        } finally {
            setCheckingStatus(null);
        }
    };

    // Auto-fill phone when student is selected
    const handleStudentSelect = (studentId: string) => {
        const student = students.find(s => s.id === studentId);
        setForm({
            ...form,
            studentId,
            phone: student?.guardianPhone || form.phone,
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'SUCCESSFUL':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle size={12} />
                        Successful
                    </span>
                );
            case 'FAILED':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle size={12} />
                        Failed
                    </span>
                );
            case 'PAY_OFFLINE':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock size={12} />
                        Awaiting Authorization
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        <AlertCircle size={12} />
                        Pending
                    </span>
                );
        }
    };

    const getOperatorLogo = (operator: string) => {
        switch (operator.toLowerCase()) {
            case 'airtel':
                return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">Airtel</span>;
            case 'mtn':
                return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">MTN</span>;
            case 'tnm':
                return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">TNM</span>;
            default:
                return <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded">{operator}</span>;
        }
    };

    const filteredCollections = collections.filter(c =>
        statusFilter === 'ALL' || c.status === statusFilter
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Smartphone className="text-blue-600 dark:text-blue-400" size={24} />
                        Mobile Money Collections
                    </h2>
                    <p className="text-slate-500 dark:text-gray-400 mt-1">Request payments directly from customer phones via Lenco</p>
                </div>
                <button
                    onClick={() => setShowInitiateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                >
                    <Send size={18} />
                    Request Payment
                </button>
            </div>

            {/* Status Filter Pills */}
            <div className="flex space-x-2 overflow-x-auto pb-2">
                {['ALL', 'PENDING', 'PAY_OFFLINE', 'SUCCESSFUL', 'FAILED'].map((status) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${statusFilter === status
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                    >
                        {status === 'ALL' ? 'All' : status === 'PAY_OFFLINE' ? 'Awaiting Auth' : status.charAt(0) + status.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {/* Collections Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Date</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Student</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Phone</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Operator</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Amount (ZMW)</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Reference</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300">Status</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-gray-300 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500 dark:text-gray-400">
                                        <RefreshCw className="inline-block animate-spin mr-2" size={18} />
                                        Loading collections...
                                    </td>
                                </tr>
                            ) : filteredCollections.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
                                                <Smartphone className="text-slate-400" size={32} />
                                            </div>
                                            <p className="text-slate-500 dark:text-gray-400 font-medium">No mobile money collections found</p>
                                            <p className="text-slate-400 text-sm mt-1">Click "Request Payment" to initiate a collection</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredCollections.map((collection) => (
                                    <tr key={collection.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300">
                                            {new Date(collection.initiatedAt).toLocaleDateString()}
                                            <div className="text-xs text-slate-400">
                                                {new Date(collection.initiatedAt).toLocaleTimeString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-800 dark:text-white">
                                                {collection.student.firstName} {collection.student.lastName}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-gray-400">
                                                {collection.student.admissionNumber}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-gray-300 font-mono text-sm">
                                            {collection.phone}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getOperatorLogo(collection.operator)}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                                            {Number(collection.amount).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-gray-400">
                                            {collection.reference}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(collection.status)}
                                            {collection.reasonForFailure && (
                                                <div className="text-xs text-red-500 mt-1">{collection.reasonForFailure}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {(collection.status === 'PENDING' || collection.status === 'PAY_OFFLINE') && (
                                                    <button
                                                        onClick={() => handleCheckStatus(collection.reference)}
                                                        disabled={checkingStatus === collection.reference}
                                                        title="Check Status"
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <RefreshCw size={18} className={checkingStatus === collection.reference ? "animate-spin" : ""} />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setSelectedCollection(collection)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors border border-slate-200 dark:border-slate-600"
                                                >
                                                    <Eye size={16} />
                                                    View
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Initiate Payment Modal */}
            {showInitiateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Phone className="text-blue-600 dark:text-blue-400" size={20} />
                                Request Mobile Money Payment
                            </h2>
                            <button
                                onClick={() => setShowInitiateModal(false)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleInitiatePayment} className="space-y-4">
                            {/* Student Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Student</label>
                                <select
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value={form.studentId}
                                    onChange={(e) => handleStudentSelect(e.target.value)}
                                >
                                    <option value="">Select a student</option>
                                    {students.map((student) => (
                                        <option key={student.id} value={student.id}>
                                            {student.firstName} {student.lastName} ({student.admissionNumber})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Amount (ZMW)</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    step="0.01"
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    placeholder="0.00"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                />
                            </div>

                            {/* Phone Number */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Phone Number</label>
                                <input
                                    type="tel"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    placeholder="e.g. 260971234567"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />
                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Enter phone number with country code (e.g. 260 for Zambia)</p>
                            </div>

                            {/* Country */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Country</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value={form.country}
                                    onChange={(e) => {
                                        const country = e.target.value;
                                        setForm({
                                            ...form,
                                            country,
                                            operator: country === 'zm' ? 'airtel' : 'airtel', // Reset operator
                                        });
                                    }}
                                >
                                    <option value="zm">Zambia</option>
                                    <option value="mw">Malawi</option>
                                </select>
                            </div>

                            {/* Operator */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Mobile Operator</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value={form.operator}
                                    onChange={(e) => setForm({ ...form, operator: e.target.value })}
                                >
                                    {form.country === 'zm' ? (
                                        <>
                                            <option value="airtel">Airtel Money</option>
                                            <option value="mtn">MTN Mobile Money</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="airtel">Airtel Money</option>
                                            <option value="tnm">TNM Mpamba</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            {/* Info Box */}
                            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={18} />
                                    <div className="text-sm text-blue-800 dark:text-blue-300">
                                        <p className="font-medium mb-1">How it works:</p>
                                        <ol className="list-decimal list-inside text-blue-700 dark:text-blue-400 space-y-1">
                                            <li>Payment request is sent to the customer's phone</li>
                                            <li>Customer enters their PIN to authorize</li>
                                            <li>Payment is confirmed and recorded automatically</li>
                                        </ol>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => setShowInitiateModal(false)}
                                    className="px-4 py-2 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 transition-all ${submitting ? 'opacity-70 cursor-not-allowed' : ''
                                        }`}
                                >
                                    {submitting ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={16} />
                                            Send Payment Request
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* View Details Modal */}
            {selectedCollection && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700">
                            <h3 className="font-bold text-slate-800 dark:text-white text-lg">Transaction Details</h3>
                            <button
                                onClick={() => setSelectedCollection(null)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full p-1 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Status Header */}
                            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-100 dark:border-slate-600">
                                <div className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                                    ZMW {Number(selectedCollection.amount).toLocaleString()}
                                </div>
                                {getStatusBadge(selectedCollection.status)}
                                {selectedCollection.reasonForFailure && (
                                    <p className="text-sm text-red-500 mt-2 text-center">{selectedCollection.reasonForFailure}</p>
                                )}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Student Name</span>
                                    <span className="font-medium text-slate-800 dark:text-white">
                                        {selectedCollection.student.firstName} {selectedCollection.student.lastName}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Admission Number</span>
                                    <span className="font-medium text-slate-800 dark:text-white">{selectedCollection.student.admissionNumber}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Phone Number</span>
                                    <span className="font-mono text-slate-800 dark:text-white">{selectedCollection.phone}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Operator</span>
                                    <div className="mt-1">{getOperatorLogo(selectedCollection.operator)}</div>
                                </div>
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Date Initiated</span>
                                    <span className="text-slate-800 dark:text-white">{new Date(selectedCollection.initiatedAt).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-500 dark:text-gray-400 mb-1">Collection Ref</span>
                                    <span className="font-mono text-xs text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded inline-block">
                                        {selectedCollection.reference}
                                    </span>
                                </div>

                                {selectedCollection.payment?.transactionId && (
                                    <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                                        <span className="block text-slate-500 dark:text-gray-400 mb-1">Transaction ID (Receipt)</span>
                                        <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg block w-full">
                                            {selectedCollection.payment.transactionId}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                                <button
                                    onClick={() => setSelectedCollection(null)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileMoneyPayment;
