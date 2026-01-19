import { useState, useEffect } from 'react';
import {
    Crown,
    Check,
    X,
    Users,
    GraduationCap,
    Building,
    AlertTriangle,
    CreditCard,
    Clock,
    TrendingUp,
    ChevronRight,
    Server,
    Smartphone
} from 'lucide-react';
import api from '../../utils/api';

interface Plan {
    id: string;
    name: string;
    tier: string;
    description: string;
    monthlyPriceZMW: number;
    yearlyPriceZMW: number;
    monthlyPriceUSD: number;
    yearlyPriceUSD: number;
    includedStudents: number;
    maxStudents: number;
    maxTeachers: number;
    maxUsers: number;
    maxClasses: number;
    maxStorageGB: number;
    monthlyApiCallLimit?: number;
    includedSmsPerMonth?: number;
    includedEmailsPerMonth?: number;
    features: string[];
    isPopular: boolean;
}

interface SubscriptionStatus {
    subscription: {
        tier: string;
        status: string;
        expiryDate: string | null;
        daysUntilExpiry: number | null;
        plan: {
            name: string;
            monthlyPriceZMW: number;
            yearlyPriceZMW: number;
        } | null;
    };
    usage: {
        students: { current: number; max: number; percentage: number };
        teachers: { current: number; max: number; percentage: number };
        users: { current: number; max: number; percentage: number };
    };
    features: Record<string, boolean>;
}

// Default feature labels (will be overridden by API data)
const defaultFeatureLabels: Record<string, string> = {
    attendance: 'Attendance Tracking',
    fee_management: 'Fee Management',
    report_cards: 'Report Cards',
    parent_portal: 'Parent Portal',
    email_notifications: 'Email Notifications',
    sms_notifications: 'SMS Notifications',
    online_assessments: 'Online Assessments',
    timetable: 'Timetable Management',
    syllabus_tracking: 'Syllabus Tracking',
    advanced_reports: 'Advanced Reports',
    api_access: 'API Access',
    white_label: 'White Label Branding',
    data_export: 'Data Export',
    basic_reports: 'Basic Reports',
    dedicated_support: 'Dedicated Support',
    custom_integrations: 'Custom Integrations',
    priority_support: 'Priority Support',
};

const tierColors: Record<string, string> = {
    FREE: 'bg-gray-100 text-gray-800 border-gray-300',
    STARTER: 'bg-blue-100 text-blue-800 border-blue-300',
    PROFESSIONAL: 'bg-purple-100 text-purple-800 border-purple-300',
    ENTERPRISE: 'bg-amber-100 text-amber-800 border-amber-300',
};

const Subscription: React.FC = () => {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [status, setStatus] = useState<SubscriptionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
    const [payments, setPayments] = useState<any[]>([]);
    const [isProofModalOpen, setIsProofModalOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<any>(null);
    const [proofRef, setProofRef] = useState('');
    const [proofNotes, setProofNotes] = useState('');
    const [submittingProof, setSubmittingProof] = useState(false);
    const [featureLabels, setFeatureLabels] = useState<Record<string, string>>(defaultFeatureLabels);

    // Mobile Money Payment Modal State
    const [isMomoModalOpen, setIsMomoModalOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [momoOperator, setMomoOperator] = useState<'mtn' | 'airtel'>('mtn');
    const [momoPhone, setMomoPhone] = useState('');
    const [processingMomo, setProcessingMomo] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [plansRes, statusRes, paymentsRes] = await Promise.all([
                api.get('/subscription/plans'),
                api.get('/subscription/status'),
                api.get('/subscription/payments?limit=10')
            ]);
            // Handle new API format: { plans, featureLabels }
            const plansData = plansRes.data.plans || plansRes.data;
            const dynamicLabels = plansRes.data.featureLabels || {};
            setPlans(plansData);
            setFeatureLabels({ ...defaultFeatureLabels, ...dynamicLabels });
            setStatus(statusRes.data);
            setPayments(paymentsRes.data.payments);
        } catch (error) {
            console.error('Failed to fetch subscription data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!window.confirm('Are you sure you want to cancel? You will keep access until the end of the billing period.')) return;

        try {
            await api.post('/subscription/cancel');
            alert('Subscription cancelled.');
            fetchData();
        } catch (error) {
            alert('Failed to cancel subscription');
        }
    };



    const viewInvoice = async (paymentId: string) => {
        try {
            const res = await api.get(`/subscription/payments/${paymentId}/invoice`, { responseType: 'text' });
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write(res.data);
                newWindow.document.close();
            }
        } catch (e) { alert('Failed to load invoice'); }
    };

    const openPaymentModal = (plan: Plan) => {
        setSelectedPlan(plan);
        setMomoPhone('');
        setMomoOperator('mtn');
        setIsMomoModalOpen(true);
    };

    const handleMobileMoneyPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPlan) return;

        setProcessingMomo(true);
        try {
            const response = await api.post('/subscription/pay-mobile-money', {
                planId: selectedPlan.id,
                billingCycle: billingCycle === 'yearly' ? 'ANNUAL' : 'MONTHLY',
                operator: momoOperator,
                phoneNumber: momoPhone,
            });

            alert(`Payment initiated!\n\nAmount: K${response.data.amount.toLocaleString()}\nPlan: ${response.data.plan.name}\n\nPlease check your phone to authorize the transaction.`);
            setIsMomoModalOpen(false);
            fetchData();
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.response?.data?.error || 'Payment failed';
            alert(`Payment failed: ${errorMsg}`);
        } finally {
            setProcessingMomo(false);
        }
    };

    const handleSubmitProof = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPayment) return;

        setSubmittingProof(true);
        try {
            await api.post(`/subscription/payments/${selectedPayment.id}/submit-proof`, {
                transactionReference: proofRef,
                notes: proofNotes
            });
            alert('Payment proof submitted successfully!');
            setIsProofModalOpen(false);
            fetchData(); // Refresh list
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to submit proof');
        } finally {
            setSubmittingProof(false);
        }
    };

    const openProofModal = (payment: any) => {
        setSelectedPayment(payment);
        setProofRef('');
        setProofNotes('');
        setIsProofModalOpen(true);
    };

    const getUsageColor = (percentage: number) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 75) return 'bg-amber-500';
        return 'bg-green-500';
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Subscription & Billing</h1>
                    <p className="text-gray-600">Manage your subscription plan and view usage</p>
                </div>
                <div className="flex items-center gap-3">
                    {status?.subscription.tier !== 'FREE' && status?.subscription.status !== 'CANCELLED' && (
                        <button onClick={handleCancel} className="text-red-600 font-medium text-sm hover:underline">
                            Cancel Subscription
                        </button>
                    )}
                    {status?.subscription.tier !== 'FREE' && (
                        <div className={`px-4 py-2 rounded-lg border ${tierColors[status?.subscription.tier || 'FREE']}`}>
                            <div className="flex items-center gap-2">
                                <Crown className="w-5 h-5" />
                                <span className="font-semibold">{status?.subscription.plan?.name || status?.subscription.tier} Plan</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Subscription Status Alert */}
            {status?.subscription.status === 'TRIAL' && status.subscription.daysUntilExpiry !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-amber-800">Trial Period</h3>
                        <p className="text-amber-700">
                            Your trial ends in {status.subscription.daysUntilExpiry} days.
                            Upgrade now to keep your data and unlock all features.
                        </p>
                    </div>
                </div>
            )}

            {status?.subscription.status === 'EXPIRED' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-red-800">Subscription Expired</h3>
                        <p className="text-red-700">
                            Your subscription has expired. Please renew to continue using all features.
                        </p>
                    </div>
                </div>
            )}

            {/* Current Usage */}
            {status && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Current Usage
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Students */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <GraduationCap className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-medium text-gray-700">Students</span>
                                </div>
                                <span className="text-sm text-gray-600">
                                    {status.usage.students.current} / {status.usage.students.max === 0 ? '∞' : status.usage.students.max}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${getUsageColor(status.usage.students.percentage)} transition-all`}
                                    style={{ width: `${Math.min(status.usage.students.percentage, 100)}%` }}
                                />
                            </div>
                            {status.usage.students.percentage >= 90 && (
                                <p className="text-xs text-red-600">Approaching limit! Consider upgrading.</p>
                            )}
                        </div>

                        {/* Teachers */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Users className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-medium text-gray-700">Teachers</span>
                                </div>
                                <span className="text-sm text-gray-600">
                                    {status.usage.teachers.current} / {status.usage.teachers.max === 0 ? '∞' : status.usage.teachers.max}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${getUsageColor(status.usage.teachers.percentage)} transition-all`}
                                    style={{ width: `${Math.min(status.usage.teachers.percentage, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Users */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Building className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-medium text-gray-700">Total Users</span>
                                </div>
                                <span className="text-sm text-gray-600">
                                    {status.usage.users.current} / {status.usage.users.max === 0 ? '∞' : status.usage.users.max}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${getUsageColor(status.usage.users.percentage)} transition-all`}
                                    style={{ width: `${Math.min(status.usage.users.percentage, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Billing Cycle Toggle */}
            <div className="flex justify-center">
                <div className="bg-gray-100 p-1 rounded-lg inline-flex">
                    <button
                        onClick={() => setBillingCycle('monthly')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'monthly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setBillingCycle('yearly')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'yearly'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        Yearly <span className="text-green-600 text-xs ml-1">Save 17%</span>
                    </button>
                </div>
            </div>

            {/* Pricing Plans */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {plans.map((plan) => {
                    const isCurrentPlan = status?.subscription.tier === plan.tier;
                    const price = Number(billingCycle === 'yearly' ? plan.yearlyPriceZMW : plan.monthlyPriceZMW);
                    const priceUSD = Number(billingCycle === 'yearly' ? plan.yearlyPriceUSD : plan.monthlyPriceUSD);

                    return (
                        <div
                            key={plan.id}
                            className={`
                                relative bg-white rounded-2xl overflow-hidden
                                border-2 transition-all duration-300
                                hover:shadow-xl hover:-translate-y-1
                                ${plan.isPopular
                                    ? 'border-purple-500 shadow-lg shadow-purple-100'
                                    : isCurrentPlan
                                        ? 'border-blue-400 shadow-md'
                                        : 'border-slate-200 hover:border-slate-300'
                                }
                            `}
                        >
                            {/* Header */}
                            <div className={`px-6 py-4 ${
                                plan.isPopular 
                                    ? 'bg-gradient-to-r from-purple-500 to-purple-600' 
                                    : isCurrentPlan
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                                        : 'bg-slate-50'
                            }`}>
                                <div className="flex items-start justify-between mb-2">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        plan.isPopular || isCurrentPlan
                                            ? 'bg-white/20'
                                            : 'bg-slate-200'
                                    }`}>
                                        <Crown className={`w-6 h-6 ${
                                            plan.isPopular || isCurrentPlan ? 'text-white' : 'text-slate-600'
                                        }`} />
                                    </div>
                                    {plan.isPopular && (
                                        <span className="px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                                            POPULAR
                                        </span>
                                    )}
                                    {isCurrentPlan && !plan.isPopular && (
                                        <span className="px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                            <Check className="w-3 h-3" /> ACTIVE
                                        </span>
                                    )}
                                </div>
                                <h3 className={`text-xl font-bold ${
                                    plan.isPopular || isCurrentPlan ? 'text-white' : 'text-slate-900'
                                }`}>
                                    {plan.name}
                                </h3>
                                <p className={`text-sm mt-1 ${
                                    plan.isPopular || isCurrentPlan ? 'text-white/80' : 'text-slate-600'
                                }`}>
                                    {plan.description}
                                </p>
                            </div>

                            {/* Pricing */}
                            <div className="px-6 py-6 border-b">
                                <div className="flex items-baseline gap-1">
                                    {price === 0 ? (
                                        <span className="text-4xl font-bold text-slate-900">Free</span>
                                    ) : (
                                        <>
                                            <span className="text-lg text-slate-600">K</span>
                                            <span className="text-4xl font-bold text-slate-900">
                                                {price.toLocaleString()}
                                            </span>
                                            <span className="text-slate-600">
                                                /{billingCycle === 'yearly' ? 'year' : 'mo'}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {price > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <p className="text-sm text-slate-500">
                                            ≈ ${priceUSD.toFixed(0)} USD
                                        </p>
                                        {billingCycle === 'yearly' && (
                                            <p className="text-xs text-green-600 font-semibold">
                                                💰 Save 17% annually
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Limits */}
                            <div className="px-6 py-4 space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600 flex items-center gap-2">
                                        <GraduationCap className="w-4 h-4" />
                                        Students
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                        {plan.maxStudents === 0 ? 'Unlimited' : plan.maxStudents.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600 flex items-center gap-2">
                                        <Users className="w-4 h-4" />
                                        Teachers
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                        {plan.maxTeachers === 0 ? 'Unlimited' : plan.maxTeachers}
                                    </span>
                                </div>
                            </div>

                            {/* Features */}
                            <div className="px-6 py-4 border-t bg-slate-50">
                                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                                    What's Included
                                </p>
                                <ul className="space-y-2 max-h-64 overflow-y-auto">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-sm">
                                            <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                            <span className="text-slate-700">
                                                {featureLabels[feature] || feature}
                                            </span>
                                        </li>
                                    ))}
                                    {plan.features.length === 0 && (
                                        <li className="text-sm text-slate-500 italic">
                                            No features listed
                                        </li>
                                    )}
                                </ul>
                            </div>

                            {/* CTA Button */}
                            <div className="px-6 py-4">
                                <button
                                    onClick={() => openPaymentModal(plan)}
                                    disabled={isCurrentPlan || plan.tier === 'FREE' || processingMomo}
                                    className={`
                                        w-full py-3 px-4 rounded-xl font-semibold text-sm
                                        transition-all duration-200
                                        flex items-center justify-center gap-2
                                        disabled:cursor-not-allowed
                                        ${isCurrentPlan
                                            ? 'bg-slate-100 text-slate-500 border border-slate-200'
                                            : plan.tier === 'FREE'
                                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                                : plan.isPopular
                                                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-md hover:shadow-lg hover:from-purple-700 hover:to-purple-800'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                                        }
                                    `}
                                >
                                    {isCurrentPlan ? (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Current Plan
                                        </>
                                    ) : plan.tier === 'FREE' ? (
                                        'Free Forever'
                                    ) : (
                                        <>
                                            {processingMomo ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    Get Started
                                                    <ChevronRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Payment Methods
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-white text-sm">MTN</span>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">MTN Mobile Money</p>
                            <p className="text-xs text-gray-500">Instant payment</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                        <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                            <span className="font-bold text-white text-xs">Airtel</span>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Airtel Money</p>
                            <p className="text-xs text-gray-500">Instant payment</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Building className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Bank Transfer</p>
                            <p className="text-xs text-gray-500">1-2 business days</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subscription Info */}
            {status?.subscription.expiryDate && (
                <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-500" />
                    <p className="text-sm text-gray-600">
                        Your subscription {status.subscription.status === 'TRIAL' ? 'trial' : 'renews'} on{' '}
                        <span className="font-medium text-gray-900">
                            {new Date(status.subscription.expiryDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                            })}
                        </span>
                    </p>
                </div>
            )}
            {/* Payment History */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Payment History
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-700 font-medium">
                            <tr>
                                <th className="px-4 py-2">Date</th>
                                <th className="px-4 py-2">Plan</th>
                                <th className="px-4 py-2">Amount</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2">Reference</th>
                                <th className="px-4 py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {payments.map(payment => (
                                <tr key={payment.id}>
                                    <td className="px-4 py-2 text-gray-600">{new Date(payment.createdAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-2 font-medium">{payment.plan?.name}</td>
                                    <td className="px-4 py-2 text-gray-900 font-semibold">{payment.currency} {Number(payment.totalAmount).toLocaleString()}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded text-xs font-semibold
                                            ${payment.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                payment.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                                    payment.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-700'}`}>
                                            {payment.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{payment.externalRef || '-'}</td>
                                    <td className="px-4 py-2">
                                        {payment.status === 'PENDING' && (
                                            <button
                                                onClick={() => openProofModal(payment)}
                                                className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 px-2 py-1 rounded hover:bg-blue-50"
                                            >
                                                Verify Payment
                                            </button>
                                        )}
                                        {payment.status === 'COMPLETED' && (
                                            <button
                                                className="text-gray-500 hover:text-gray-700 text-xs flex items-center gap-1"
                                                onClick={() => viewInvoice(payment.id)}
                                            >
                                                Invoice
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {payments.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No payment history found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Proof Submission Modal */}
            {isProofModalOpen && selectedPayment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Verify Payment</h3>
                            <button onClick={() => setIsProofModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            Please enter the transaction reference from your Mobile Money or Bank transfer for
                            <span className="font-semibold text-gray-800"> {selectedPayment.currency} {Number(selectedPayment.totalAmount).toLocaleString()}</span>.
                        </p>
                        <form onSubmit={handleSubmitProof} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Reference / ID</label>
                                <input
                                    required
                                    type="text"
                                    value={proofRef}
                                    onChange={e => setProofRef(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="e.g. 182739482 or TR-999"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                                <textarea
                                    value={proofNotes}
                                    onChange={e => setProofNotes(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    rows={3}
                                    placeholder="Any additional details..."
                                />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsProofModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingProof}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {submittingProof ? 'Submitting...' : 'Submit Proof'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Mobile Money Payment Modal */}
            {isMomoModalOpen && selectedPlan && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Complete Payment</h3>
                            <button onClick={() => setIsMomoModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Plan Summary */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                                    <Crown className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">{selectedPlan.name} Plan</p>
                                    <p className="text-sm text-gray-600">{billingCycle === 'yearly' ? 'Annual' : 'Monthly'} billing</p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-blue-100">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Amount</span>
                                    <span className="text-2xl font-bold text-gray-900">
                                        K{Number(billingCycle === 'yearly' ? selectedPlan.yearlyPriceZMW : selectedPlan.monthlyPriceZMW).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">+ 2.5% processing fee</p>
                            </div>
                        </div>

                        <form onSubmit={handleMobileMoneyPayment} className="space-y-4">
                            {/* Operator Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Mobile Money Provider</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setMomoOperator('mtn')}
                                        className={`p-4 rounded-xl border-2 transition-all ${momoOperator === 'mtn'
                                            ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center mx-auto mb-2">
                                            <span className="font-bold text-white text-sm">MTN</span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">MTN MoMo</p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMomoOperator('airtel')}
                                        className={`p-4 rounded-xl border-2 transition-all ${momoOperator === 'airtel'
                                            ? 'border-red-400 bg-red-50 ring-2 ring-red-200'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center mx-auto mb-2">
                                            <span className="font-bold text-white text-xs">Airtel</span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">Airtel Money</p>
                                    </button>
                                </div>
                            </div>

                            {/* Phone Number */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <Smartphone className="w-4 h-4 inline mr-1" />
                                    Phone Number
                                </label>
                                <input
                                    required
                                    type="tel"
                                    value={momoPhone}
                                    onChange={e => setMomoPhone(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="260 9XX XXX XXX"
                                />
                                <p className="text-xs text-gray-500 mt-1">Enter the number registered with {momoOperator === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}</p>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsMomoModalOpen(false)}
                                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingMomo || !momoPhone}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                                >
                                    {processingMomo ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <CreditCard className="w-4 h-4" />
                                            Pay Now
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

export default Subscription;
