import React from 'react';
import { X, FileText, Mail } from 'lucide-react';
import { Payment } from '../../types';

interface TransactionDetailsModalProps {
    payment: Payment | null;
    onClose: () => void;
    onDownloadReceipt: (payment: Payment) => void;
    onVoid: (id: string) => void;
    onEmailReceipt: () => void;
}

const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
    payment,
    onClose,
    onDownloadReceipt,
    onVoid,
    onEmailReceipt
}) => {
    if (!payment) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Transaction Details</h2>
                        <p className="text-sm text-slate-500">View payment information</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Header Info */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Amount</p>
                            <p className="text-2xl font-bold text-slate-900">ZMW {Number(payment.amount).toLocaleString()}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${payment.status === 'COMPLETED' ? 'bg-green-100 text-green-700 border-green-200' :
                            payment.status === 'CANCELLED' ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                            {payment.status}
                        </div>
                    </div>

                    {/* Grid Details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Student</p>
                            <p className="font-medium text-slate-900">{payment.student.firstName} {payment.student.lastName}</p>
                            <p className="text-sm text-slate-500">{payment.student.admissionNumber}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Class</p>
                            <p className="font-medium text-slate-900">{payment.student.class?.name || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Date & Time</p>
                            <p className="font-medium text-slate-900">{new Date(payment.paymentDate).toLocaleDateString()}</p>
                            <p className="text-sm text-slate-500">{new Date(payment.paymentDate).toLocaleTimeString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Payment Method</p>
                            <p className="font-medium text-slate-900 capitalize">{payment.method.replace('_', ' ').toLowerCase()}</p>
                        </div>
                        <div className="col-span-2">
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Transaction ID</p>
                            <p className="font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded text-sm inline-block border border-slate-200">
                                {payment.transactionId || '-'}
                            </p>
                        </div>
                        {/* Mobile Money Details */}
                        {payment.method === 'MOBILE_MONEY' && payment.mobileMoneyOperator && (
                            <div className="col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Mobile Money Details</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                            payment.mobileMoneyOperator === 'mtn' 
                                                ? 'bg-yellow-400' 
                                                : 'bg-red-500'
                                        }`}>
                                            <span className="font-bold text-white text-xs">
                                                {payment.mobileMoneyOperator === 'mtn' ? 'MTN' : 'Airtel'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Operator</p>
                                            <p className="font-medium text-slate-900 capitalize">
                                                {payment.mobileMoneyOperator === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}
                                            </p>
                                        </div>
                                    </div>
                                    {payment.mobileMoneyPhone && (
                                        <div>
                                            <p className="text-xs text-slate-500">Phone Number</p>
                                            <p className="font-medium text-slate-900">{payment.mobileMoneyPhone}</p>
                                        </div>
                                    )}
                                    {payment.mobileMoneyRef && (
                                        <div className="col-span-2">
                                            <p className="text-xs text-slate-500">Reference</p>
                                            <p className="font-mono text-sm text-slate-700">{payment.mobileMoneyRef}</p>
                                        </div>
                                    )}
                                    {payment.mobileMoneyFee && Number(payment.mobileMoneyFee) > 0 && (
                                        <div>
                                            <p className="text-xs text-slate-500">Processing Fee</p>
                                            <p className="font-medium text-slate-900">ZMW {Number(payment.mobileMoneyFee).toFixed(2)}</p>
                                        </div>
                                    )}
                                    {payment.mobileMoneyStatus && (
                                        <div>
                                            <p className="text-xs text-slate-500">Status</p>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                payment.mobileMoneyStatus === 'SUCCESS' 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : payment.mobileMoneyStatus === 'PENDING'
                                                        ? 'bg-yellow-100 text-yellow-700'
                                                        : 'bg-red-100 text-red-700'
                                            }`}>
                                                {payment.mobileMoneyStatus}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {payment.notes && (
                            <div className="col-span-2">
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Notes</p>
                                <p className="text-sm text-slate-700 bg-yellow-50 p-3 rounded-lg border border-yellow-100 italic">
                                    "{payment.notes}"
                                </p>
                            </div>
                        )}
                        {payment.status === 'CANCELLED' && payment.voidReason && (
                            <div className="col-span-2">
                                <p className="text-xs text-red-500 uppercase font-bold tracking-wider mb-1">Void Reason</p>
                                <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
                                    {payment.voidReason}
                                </p>
                            </div>
                        )}

                        <div className="col-span-2 border-t pt-4">
                            <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Recorded By</p>
                            <p className="text-sm text-slate-600">{payment.recordedBy.fullName}</p>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-3">
                        <button
                            onClick={() => onDownloadReceipt(payment)}
                            className="flex-1 bg-slate-800 text-white px-4 py-2.5 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                            <FileText size={18} />
                            Download Receipt
                        </button>

                        {payment.status !== 'CANCELLED' && (
                            <button
                                onClick={onEmailReceipt}
                                className="px-4 py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors font-medium flex items-center gap-2"
                            >
                                <Mail size={18} />
                                Email Receipt
                            </button>
                        )}

                        {payment.status !== 'CANCELLED' && (
                            <button
                                onClick={() => onVoid(payment.id)}
                                className="px-4 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors font-medium"
                            >
                                Void Payment
                            </button>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};
export default TransactionDetailsModal;
