import React, { useState, useEffect } from 'react';
import { Search, Check, Loader2, School, CreditCard, Phone, ArrowRight, ShieldCheck, GraduationCap, CheckCircle } from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

const PublicPayment = () => {
    const [step, setStep] = useState(1);
    const [identifier, setIdentifier] = useState('');
    const [loading, setLoading] = useState(false);
    const [student, setStudent] = useState<any>(null);
    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState('');
    const [operator, setOperator] = useState('airtel');
    const [result, setResult] = useState<any>(null);

    // Fees
    const [fees, setFees] = useState({ processing: 0, total: 0 });

    useEffect(() => {
        const val = parseFloat(amount) || 0;
        const processing = val * 0.025; // 2.5% matches backend logic
        setFees({
            processing,
            total: val + processing
        });
    }, [amount]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!identifier.trim()) return;

        setLoading(true);
        try {
            const res = await api.get(`/payments/public/students/${identifier}`);
            setStudent(res.data);
            setStep(2);
            if (res.data.balance > 0) {
                setAmount(res.data.balance.toString());
            } else {
                setAmount('');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Student not found');
        } finally {
            setLoading(false);
        }
    };

    const handlePay = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !amount || !phone) return;

        setLoading(true);
        try {
            const payload = {
                studentId: student.id,
                amount: parseFloat(amount),
                phone,
                operator,
                country: 'zm'
            };
            const res = await api.post('/payments/public/mobile-money/initiate', payload);
            setResult(res.data);
            setStep(3);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Payment initiation failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-900 dark:text-white">

            {/* STEP 1: VERIFY */}
            {step === 1 && (
                <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                    {/* Header */}
                    <div className="bg-blue-600 p-10 text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-10 text-white">
                            <GraduationCap size={120} />
                        </div>
                        <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm text-white shadow-inner">
                            <School size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-1">School Fees Payment</h1>
                        <p className="text-blue-100 font-medium opacity-90">Secure Mobile Money Payment Portal</p>
                    </div>

                    {/* Body */}
                    <div className="p-10">
                        <form onSubmit={handleVerify} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Student ID or Admission Number</label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={identifier}
                                        onChange={e => setIdentifier(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 transition-all font-medium placeholder:text-slate-400 dark:text-white"
                                        placeholder="Enter ID..."
                                        required
                                    />
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30 flex items-center justify-center gap-2 transform active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <>Verify Student <ArrowRight size={20} /></>}
                            </button>

                            <div className="text-center pt-2">
                                <a href="#" className="text-sm text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1">
                                    Having trouble? <span className="underline decoration-slate-300">Contact Support</span>
                                </a>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* STEP 2: PAYMENT DETAILS */}
            {step === 2 && student && (
                <div className="w-full max-w-5xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in slide-in-from-right-8 duration-500">

                    {/* Left Column: Form */}
                    <div className="flex-1 p-6 md:p-10 bg-white dark:bg-slate-800">
                        {/* Stepper */}
                        <div className="flex items-center justify-between mb-8 max-w-sm mx-auto md:mx-0">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                                    <Check size={16} />
                                </div>
                                <span className="text-xs font-bold text-blue-600">Verify</span>
                            </div>
                            <div className="flex-1 h-1 bg-blue-100 dark:bg-blue-900 mx-2 rounded-full relative overflow-hidden">
                                <div className="absolute left-0 top-0 h-full w-full bg-blue-600 origin-left animate-slide" />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-blue-100 dark:ring-blue-900">
                                    2
                                </div>
                                <span className="text-xs font-bold text-blue-600">Pay</span>
                            </div>
                            <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-700 mx-2 rounded-full" />
                            <div className="flex flex-col items-center gap-2 opacity-40">
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center font-bold text-sm border border-slate-200 dark:border-slate-600">
                                    3
                                </div>
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Receipt</span>
                            </div>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Make Payment</h2>
                            <p className="text-slate-500 dark:text-slate-400">Complete the transaction securely.</p>
                        </div>

                        {/* Profile Card & Balance */}
                        <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-5 border border-slate-100 dark:border-slate-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg shrink-0">
                                    {student.firstName[0]}{student.lastName[0]}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">{student.firstName} {student.lastName}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-semibold">{student.class?.name} • {student.admissionNumber}</p>
                                </div>
                            </div>
                            <div className="text-left sm:text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Outstanding</p>
                                <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                    ZMW {Number(student.balance).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handlePay} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Payment Amount (ZMW)</label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-700 border-2 border-slate-100 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-0 transition-all font-bold text-lg dark:text-white"
                                        placeholder="0.00"
                                        required
                                    />
                                    <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Payer Phone Number</label>
                                <div className="relative group">
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-700 border-2 border-slate-100 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-0 transition-all font-medium dark:text-white"
                                        placeholder="e.g 097xxxxxxx"
                                        required
                                    />
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Select Network Operator</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <label className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all h-20 flex items-center justify-center ${operator === 'airtel' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-100 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-slate-200 dark:hover:border-slate-500'}`}>
                                        <input type="radio" name="operator" value="airtel" checked={operator === 'airtel'} onChange={e => setOperator(e.target.value)} className="sr-only" />
                                        <div className={`font-black text-lg ${operator === 'airtel' ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>Airtel</div>
                                        {operator === 'airtel' && <div className="absolute top-2 right-2 text-red-600 dark:text-red-400"><CheckCircle size={16} /></div>}
                                    </label>
                                    <label className={`cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all h-20 flex items-center justify-center ${operator === 'mtn' ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : 'border-slate-100 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-slate-200 dark:hover:border-slate-500'}`}>
                                        <input type="radio" name="operator" value="mtn" checked={operator === 'mtn'} onChange={e => setOperator(e.target.value)} className="sr-only" />
                                        <div className={`font-black text-lg ${operator === 'mtn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-400'}`}>MTN</div>
                                        {operator === 'mtn' && <div className="absolute top-2 right-2 text-yellow-600 dark:text-yellow-400"><CheckCircle size={16} /></div>}
                                    </label>
                                </div>
                            </div>

                            {/* Mobile Summary */}
                            <div className="md:hidden bg-slate-50 dark:bg-slate-700 p-4 rounded-2xl border border-slate-100 dark:border-slate-600 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Payment Amount</span>
                                    <span className="font-bold text-slate-900 dark:text-white">ZMW {Number(amount || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Processing Fee</span>
                                    <span className="font-bold text-slate-900 dark:text-white">ZMW {fees.processing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="border-t border-slate-200 dark:border-slate-600 pt-2 flex justify-between items-center mt-2">
                                    <span className="font-bold text-slate-900 dark:text-white">Total</span>
                                    <span className="font-black text-xl text-blue-600 dark:text-blue-400">ZMW {fees.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 font-bold px-6 rounded-2xl transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !amount}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-200 dark:shadow-blue-900/30 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <>Pay ZMW {fees.total.toLocaleString()} <ArrowRight size={20} /></>}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right Column: Information (Desktop Stick) */}
                    <div className="hidden md:block w-96 bg-slate-50 dark:bg-slate-700 p-10 border-l border-slate-100 dark:border-slate-600 relative">
                        <div className="sticky top-10 space-y-8">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-4">Transaction Summary</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-600 border-dashed">
                                        <span className="text-slate-500 dark:text-slate-400">Tuition/Fees</span>
                                        <span className="font-mono font-medium dark:text-white">ZMW {Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-slate-600 border-dashed">
                                        <span className="text-slate-500 dark:text-slate-400">Processing Fee</span>
                                        <span className="font-mono font-medium dark:text-white">ZMW {fees.processing.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <span className="text-lg font-bold text-slate-900 dark:text-white">Total</span>
                                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">ZMW {fees.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-100 dark:bg-blue-900/30 p-6 rounded-2xl border border-blue-200 dark:border-blue-800">
                                <div className="flex gap-3">
                                    <div className="bg-blue-600 text-white p-2 rounded-lg shrink-0 h-fit">
                                        <ShieldCheck size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-blue-900 dark:text-blue-300 mb-1">Secure Transaction</h4>
                                        <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">
                                            You will receive a prompt on your phone ({phone || '...'}) to approve the transaction. Please ensure your screen is unlocked.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: RECEIPT */}
            {step === 3 && result && (
                <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden p-10 text-center animate-in zoom-in duration-300">
                    <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-100 dark:shadow-green-900/30 ring-8 ring-green-50 dark:ring-green-900/20">
                        <Check size={48} strokeWidth={3} />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Payment Initiated</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">Please check your phone to complete the payment.</p>

                    <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-6 mb-8 border border-slate-100 dark:border-slate-600">
                        <div className="flex justify-between mb-2">
                            <span className="text-slate-500 dark:text-slate-400">Reference</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{result.reference}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Mobile Number</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{phone}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => { setStep(1); setIdentifier(''); setAmount(''); setPhone(''); }}
                        className="w-full bg-slate-900 dark:bg-slate-600 hover:bg-black dark:hover:bg-slate-500 text-white font-bold py-4 rounded-2xl transition-all"
                    >
                        Back to Home
                    </button>
                </div>
            )}

        </div>
    );
};

export default PublicPayment;
