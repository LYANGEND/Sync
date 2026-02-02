import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Building, 
  User, 
  Phone,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface School {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  address?: string;
  primaryColor?: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  guardianName?: string;
  guardianPhone?: string;
  balance: number;
  totalFees: number;
  totalPaid: number;
  class?: {
    id: string;
    name: string;
  };
}

interface PaymentResult {
  id: string;
  transactionId: string;
  amount: number;
  fee: number;
  originalAmount: number;
  status: string;
  operator: string;
  phone: string;
}

const API_BASE = '/api/public/payments';

const PublicPayment: React.FC = () => {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const [searchParams] = useSearchParams();
  
  // State
  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState(searchParams.get('admission') || '');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  
  // Payment form state
  const [amount, setAmount] = useState('');
  const [operator, setOperator] = useState<'mtn' | 'airtel'>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // Payment result
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle');
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Load school info
  useEffect(() => {
    if (schoolSlug) {
      fetchSchoolInfo();
    }
  }, [schoolSlug]);

  // Auto-search if admission number in URL
  useEffect(() => {
    if (school && admissionNumber) {
      handleSearchStudent();
    }
  }, [school]);

  const fetchSchoolInfo = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/school/${schoolSlug}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'School not found');
      }
      const data = await response.json();
      setSchool(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchStudent = async () => {
    if (!admissionNumber.trim() || !school) return;
    
    try {
      setSearching(true);
      setError('');
      setStudent(null);
      
      const response = await fetch(
        `${API_BASE}/student/search?admissionNumber=${encodeURIComponent(admissionNumber)}&tenantSlug=${school.slug}`
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Student not found');
      }
      
      const data = await response.json();
      setStudent(data.student);
      
      // Pre-fill phone if available
      if (data.student.guardianPhone) {
        setPhoneNumber(data.student.guardianPhone);
      }
      if (data.student.guardianName) {
        setPayerName(data.student.guardianName);
      }
      // Pre-fill amount with balance
      if (data.student.balance > 0) {
        setAmount(data.student.balance.toString());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !amount || !phoneNumber) return;

    try {
      setProcessing(true);
      setError('');
      
      const response = await fetch(`${API_BASE}/school/${schoolSlug}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          amount: Number(amount),
          operator,
          phoneNumber,
          payerName,
          payerPhone: phoneNumber,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Payment failed');
      }

      setPaymentResult(data.payment);
      setPaymentStatus('pending');
      
      // Start polling for status
      pollPaymentStatus(data.payment.transactionId);
    } catch (err: any) {
      setError(err.message);
      setPaymentStatus('failed');
    } finally {
      setProcessing(false);
    }
  };

  const pollPaymentStatus = async (transactionId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (every 5 seconds)
    
    const checkStatus = async () => {
      if (attempts >= maxAttempts) {
        setPaymentStatus('pending');
        return;
      }
      
      try {
        setCheckingStatus(true);
        const response = await fetch(`${API_BASE}/status/${transactionId}`);
        const data = await response.json();
        
        if (data.status === 'COMPLETED') {
          setPaymentStatus('success');
          return;
        } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
          setPaymentStatus('failed');
          return;
        }
        
        // Still pending, check again
        attempts++;
        setTimeout(checkStatus, 5000);
      } catch (err) {
        attempts++;
        setTimeout(checkStatus, 5000);
      } finally {
        setCheckingStatus(false);
      }
    };
    
    setTimeout(checkStatus, 5000);
  };

  const handleCheckStatus = async () => {
    if (!paymentResult) return;
    
    try {
      setCheckingStatus(true);
      const response = await fetch(`${API_BASE}/status/${paymentResult.transactionId}`);
      const data = await response.json();
      
      if (data.status === 'COMPLETED') {
        setPaymentStatus('success');
      } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        setPaymentStatus('failed');
      }
    } catch (err) {
      console.error('Failed to check status:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const resetPayment = () => {
    setPaymentResult(null);
    setPaymentStatus('idle');
    setAmount('');
    setStudent(null);
    setAdmissionNumber('');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-slate-600">Loading payment portal...</p>
        </div>
      </div>
    );
  }

  // School not found
  if (!school) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">School Not Found</h1>
          <p className="text-slate-600">{error || 'The payment portal you are looking for does not exist.'}</p>
        </div>
      </div>
    );
  }

  // Payment success screen
  if (paymentStatus === 'success' && paymentResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h1>
          <p className="text-slate-600 mb-6">Your payment has been confirmed.</p>
          
          <div className="bg-green-50 rounded-xl p-4 mb-6 text-left">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600">Amount Paid</span>
              <span className="font-bold text-green-700">ZMW {paymentResult.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600">Transaction ID</span>
              <span className="font-mono text-sm">{paymentResult.transactionId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Phone</span>
              <span>{paymentResult.phone}</span>
            </div>
          </div>
          
          <button
            onClick={resetPayment}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
          >
            Make Another Payment
          </button>
        </div>
      </div>
    );
  }

  // Payment pending/processing screen
  if (paymentStatus === 'pending' && paymentResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Phone className="w-10 h-10 text-blue-600 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check Your Phone</h1>
          <p className="text-slate-600 mb-6">
            A payment prompt has been sent to <strong>{paymentResult.phone}</strong>. 
            Please enter your PIN to authorize the payment.
          </p>
          
          <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600">Amount</span>
              <span className="font-bold text-blue-700">ZMW {paymentResult.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-600">Includes Fee</span>
              <span className="text-sm text-slate-500">ZMW {paymentResult.fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">Reference</span>
              <span className="font-mono text-sm">{paymentResult.transactionId}</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={handleCheckStatus}
              disabled={checkingStatus}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {checkingStatus ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Check Payment Status
                </>
              )}
            </button>
            
            <button
              onClick={resetPayment}
              className="w-full py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel & Start Over
            </button>
          </div>
          
          <p className="text-xs text-slate-500 mt-4">
            Didn't receive the prompt? Make sure your phone is on and has network coverage.
          </p>
        </div>
      </div>
    );
  }

  // Main payment form
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {school.logoUrl ? (
              <img src={school.logoUrl} alt={school.name} className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <Building className="w-7 h-7 text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">{school.name}</h1>
              <p className="text-sm text-slate-500">Online Fee Payment Portal</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Search Student */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
              1
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Find Student</h2>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Enter admission number..."
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchStudent()}
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSearchStudent}
              disabled={searching || !admissionNumber.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              Search
            </button>
          </div>
        </div>

        {/* Step 2: Student Info & Payment Form */}
        {student && (
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Make Payment</h2>
            </div>

            {/* Student Card */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <User className="w-7 h-7 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900">{student.firstName} {student.lastName}</h3>
                  <p className="text-sm text-slate-600">{student.admissionNumber} • {student.class?.name || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Balance Due</p>
                  <p className={`text-xl font-bold ${student.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ZMW {student.balance.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Form */}
            <form onSubmit={handleSubmitPayment} className="space-y-5">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Payment Amount (ZMW)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="1"
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-medium"
                />
                <p className="text-xs text-slate-500 mt-1">A 2.5% processing fee will be added</p>
              </div>

              {/* Operator Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Mobile Money</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setOperator('mtn')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      operator === 'mtn' 
                        ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-12 h-12 bg-yellow-400 rounded-xl flex items-center justify-center">
                      <span className="font-bold text-white">MTN</span>
                    </div>
                    <span className="font-medium text-slate-900">MTN MoMo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperator('airtel')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      operator === 'airtel' 
                        ? 'border-red-400 bg-red-50 ring-2 ring-red-200' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center">
                      <span className="font-bold text-white text-sm">Airtel</span>
                    </div>
                    <span className="font-medium text-slate-900">Airtel Money</span>
                  </button>
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="260 9XX XXX XXX"
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Enter the {operator === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} registered number
                </p>
              </div>

              {/* Payer Name (optional) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Your Name (Optional)</label>
                <input
                  type="text"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Summary */}
              {amount && (
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Payment Amount</span>
                    <span className="font-medium">ZMW {Number(amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Processing Fee (2.5%)</span>
                    <span className="font-medium">ZMW {(Number(amount) * 0.025).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-900">Total to Pay</span>
                    <span className="font-bold text-blue-600">
                      ZMW {(Number(amount) * 1.025).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={processing || !amount || !phoneNumber}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Pay Now
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Powered by <strong>Sync School Management</strong></p>
          <p className="mt-1">Secure payments via Mobile Money</p>
        </div>
      </div>
    </div>
  );
};

export default PublicPayment;
