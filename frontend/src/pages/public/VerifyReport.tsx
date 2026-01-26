import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, School, Loader, ShieldCheck, Calendar, User, BookOpen } from 'lucide-react';
import api from '../../utils/api';

interface VerificationResult {
    valid: boolean;
    studentName?: string;
    admissionNumber?: string;
    className?: string;
    term?: string;
    averageScore?: number;
    schoolName?: string;
    generatedAt?: string;
    message?: string;
}

const VerifyReport = () => {
    const { id } = useParams<{ id: string }>();
    const [result, setResult] = useState<VerificationResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verify = async () => {
            try {
                const response = await api.get(`/reports/public/verify/${id}`);
                setResult(response.data);
            } catch (err: any) {
                setResult({ valid: false, message: 'Invalid or expired report QR code.' });
            } finally {
                setLoading(false);
            }
        };

        if (id) verify();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg flex flex-col items-center">
                    <Loader className="animate-spin text-blue-600 mb-4" size={48} />
                    <p className="text-slate-600 dark:text-slate-300 font-medium">Verifying Authenticity...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 max-w-sm w-full rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                {/* Header Banner */}
                <div className={`py-8 px-6 text-center relative overflow-hidden ${result?.valid ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <School className="w-64 h-64 -mb-16 -ml-16 transform rotate-12" />
                    </div>

                    <div className="relative z-10 flex flex-col items-center text-white">
                        <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg mb-4 ring-4 ring-white/30">
                            {result?.valid ? (
                                <CheckCircle className="text-white" size={48} />
                            ) : (
                                <XCircle className="text-white" size={48} />
                            )}
                        </div>
                        <h1 className="text-2xl font-bold tracking-wide uppercase">
                            {result?.valid ? 'Verified' : 'Invalid'}
                        </h1>
                        <p className="text-blue-50 text-sm mt-1 font-medium opacity-90">
                            {result?.valid ? 'Official School Document' : 'Verification Failed'}
                        </p>
                    </div>
                </div>

                {/* Content */}
                {result?.valid ? (
                    <div className="p-6">
                        {/* School Name */}
                        <div className="text-center mb-6">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Issued By</p>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">
                                {result.schoolName || 'Sync International School'}
                            </h2>
                        </div>

                        {/* Details Cards */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <User size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase">Student Name</p>
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">{result.studentName}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                                        <BookOpen size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase truncate">Class</p>
                                        <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{result.className}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600">
                                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                                        <Calendar size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase truncate">Term</p>
                                        <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{result.term}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Score Highlight */}
                            <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800 rounded-xl p-4 flex justify-between items-center text-white shadow-lg">
                                <div>
                                    <p className="text-xs text-slate-300 uppercase font-bold">Term Average</p>
                                    <p className="text-xs text-slate-400">Overall Performance</p>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold">{result.averageScore}</span>
                                    <span className="text-sm font-medium opacity-70">%</span>
                                </div>
                            </div>

                            <div className="text-center pt-2">
                                <p className="text-xs font-mono text-slate-400">ID: {result.admissionNumber}</p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
                            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                <ShieldCheck size={14} />
                                <span>Authenticity Guaranteed</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2">
                                Generated on {result.generatedAt ? new Date(result.generatedAt).toLocaleDateString() : 'N/A'} via Sync School System
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center bg-white dark:bg-slate-800">
                        <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">
                            {result?.message || 'We could not verify this document.'}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Please check if the QR code is correct or contact the school administration for assistance.
                        </p>
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-400">Sync School Verification System</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VerifyReport;
