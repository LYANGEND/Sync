import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, School, Loader, ShieldCheck } from 'lucide-react';
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
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <Loader className="animate-spin text-blue-600 mb-4" size={40} />
                <p className="text-slate-600">Verifying Report Authenticity...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden">
                {/* Header */}
                <div className={`p-6 text-center ${result?.valid ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="mx-auto w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                        {result?.valid ? (
                            <CheckCircle className="text-green-500" size={32} />
                        ) : (
                            <XCircle className="text-red-500" size={32} />
                        )}
                    </div>
                    <h1 className={`text-2xl font-bold ${result?.valid ? 'text-green-800' : 'text-red-800'}`}>
                        {result?.valid ? 'Verified Authentic' : 'Verification Failed'}
                    </h1>
                    <p className={`text-sm mt-1 ${result?.valid ? 'text-green-600' : 'text-red-600'}`}>
                        {result?.valid ? 'This report card is a valid document issued by the school system.' : result?.message}
                    </p>
                </div>

                {/* Content */}
                {result?.valid && (
                    <div className="p-6 space-y-6">
                        <div className="text-center">
                            <div className="inline-flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">
                                <School size={12} />
                                School Name
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">{result.schoolName}</h3>
                        </div>

                        <div className="border-t border-slate-100 pt-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 font-bold uppercase">Student</label>
                                    <p className="font-semibold text-slate-800">{result.studentName}</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 font-bold uppercase">Admission No</label>
                                    <p className="font-mono text-slate-800">{result.admissionNumber}</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 font-bold uppercase">Class</label>
                                    <p className="font-semibold text-slate-800">{result.className}</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 font-bold uppercase">Term</label>
                                    <p className="font-semibold text-slate-800">{result.term}</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 flex justify-between items-center border border-slate-100 mt-2">
                                <span className="text-sm font-bold text-slate-600">Term Average</span>
                                <span className="text-xl font-bold text-blue-600">{result.averageScore}%</span>
                            </div>
                        </div>

                        <div className="pt-4 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                                <ShieldCheck size={14} />
                                <span>Securely verified by Sync System</span>
                            </div>
                            <p className="text-[10px] text-slate-300 mt-1">Generated: {new Date(result.generatedAt || '').toLocaleDateString()}</p>
                        </div>
                    </div>
                )}

                {!result?.valid && (
                    <div className="p-6 text-center">
                        <p className="text-slate-500 text-sm">
                            The document you scanned could not be verified in our system. It may be forged, or the QR code is invalid.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VerifyReport;
