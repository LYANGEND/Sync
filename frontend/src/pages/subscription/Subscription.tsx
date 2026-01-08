import React, { useState, useEffect } from 'react';
import {
    Crown,
    Check,
    X,
    Users,
    GraduationCap,
    Building,
    Zap,
    AlertTriangle,
    CreditCard,
    Clock,
    TrendingUp,
    ChevronRight
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

const featureLabels: Record<string, string> = {
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
    const [upgrading, setUpgrading] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [plansRes, statusRes] = await Promise.all([
                api.get('/subscription/plans'),
                api.get('/subscription/status'),
            ]);
            setPlans(plansRes.data);
            setStatus(statusRes.data);
        } catch (error) {
            console.error('Failed to fetch subscription data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpgrade = async (planId: string) => {
        if (!window.confirm('Are you sure you want to upgrade? You will receive payment instructions.')) {
            return;
        }

        setUpgrading(true);
        try {
            const response = await api.post('/subscription/upgrade', {
                planId,
                billingCycle: billingCycle === 'yearly' ? 'ANNUAL' : 'MONTHLY',
            });

            alert(`Upgrade initiated!\n\nAmount: K${response.data.amount.toLocaleString()}\n\nPayment Instructions:\n- MTN MoMo: ${response.data.paymentInstructions.mobileMoney.mtn}\n- Airtel Money: ${response.data.paymentInstructions.mobileMoney.airtel}\n\nReference: ${response.data.paymentId}`);
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to initiate upgrade');
        } finally {
            setUpgrading(false);
        }
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
                {status?.subscription.tier !== 'FREE' && (
                    <div className={`px-4 py-2 rounded-lg border ${tierColors[status?.subscription.tier || 'FREE']}`}>
                        <div className="flex items-center gap-2">
                            <Crown className="w-5 h-5" />
                            <span className="font-semibold">{status?.subscription.plan?.name || status?.subscription.tier} Plan</span>
                        </div>
                    </div>
                )}
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
                            className={`relative bg-white rounded-xl border-2 p-6 transition-all ${plan.isPopular
                                ? 'border-purple-500 shadow-lg scale-105'
                                : isCurrentPlan
                                    ? 'border-blue-500'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            {plan.isPopular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="bg-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                                        Most Popular
                                    </span>
                                </div>
                            )}

                            {isCurrentPlan && (
                                <div className="absolute -top-3 right-4">
                                    <span className="bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                                        Current Plan
                                    </span>
                                </div>
                            )}

                            <div className="text-center mb-6">
                                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                            </div>

                            <div className="text-center mb-6">
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-3xl font-bold text-gray-900">
                                        {price === 0 ? 'Free' : `K${price.toLocaleString()}`}
                                    </span>
                                    {price > 0 && (
                                        <span className="text-gray-500 text-sm">
                                            /{billingCycle === 'yearly' ? 'year' : 'month'}
                                        </span>
                                    )}
                                </div>
                                {price > 0 && (
                                    <p className="text-xs text-gray-400 mt-1">
                                        ~${priceUSD.toFixed(2)} USD
                                    </p>
                                )}
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex items-center gap-2 text-sm">
                                    <GraduationCap className="w-4 h-4 text-gray-400" />
                                    <span>
                                        {plan.maxStudents === 0 ? 'Unlimited' : plan.includedStudents} students
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Users className="w-4 h-4 text-gray-400" />
                                    <span>
                                        {plan.maxTeachers === 0 ? 'Unlimited' : plan.maxTeachers} teachers
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4 mb-6">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Features</p>
                                <ul className="space-y-2">
                                    {plan.features.slice(0, 5).map((feature) => (
                                        <li key={feature} className="flex items-center gap-2 text-sm">
                                            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                            <span className="text-gray-600">{featureLabels[feature] || feature}</span>
                                        </li>
                                    ))}
                                    {plan.features.length > 5 && (
                                        <li className="text-xs text-gray-400">
                                            +{plan.features.length - 5} more features
                                        </li>
                                    )}
                                </ul>
                            </div>

                            <button
                                onClick={() => handleUpgrade(plan.id)}
                                disabled={isCurrentPlan || plan.tier === 'FREE' || upgrading}
                                className={`w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${isCurrentPlan
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : plan.tier === 'FREE'
                                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                                        : plan.isPopular
                                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                            >
                                {isCurrentPlan ? (
                                    'Current Plan'
                                ) : plan.tier === 'FREE' ? (
                                    'Free Forever'
                                ) : (
                                    <>
                                        {upgrading ? 'Processing...' : 'Upgrade Now'}
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
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
        </div>
    );
};

export default Subscription;
