import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Building, Users, GraduationCap, BookOpen,
    CreditCard, TrendingUp, Settings, Activity, MapPin,
    Phone, Mail, Edit2, RefreshCw, ArrowRightLeft
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface BranchData {
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
    isMain: boolean;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    capacity?: number;
    logoUrl?: string;
    parentBranch?: { id: string; name: string; code: string };
    childBranches?: { id: string; name: string; code: string }[];
    _count?: {
        students: number;
        users: number;
        classes: number;
        payments: number;
    };
}

interface AnalyticsData {
    branch: BranchData;
    stats: {
        students: number;
        users: number;
        classes: number;
        totalPayments: number;
        paymentCount: number;
        attendanceRate: number;
        capacityUtilization: number | null;
    };
    enrollmentTrend: any[];
}

interface FinancialData {
    branchId: string;
    branchName: string;
    summary: {
        totalCollected: number;
        totalPayments: number;
        outstanding: number;
    };
    byMethod: { method: string; total: number; count: number }[];
    monthlyTrend: any[];
}

type TabType = 'overview' | 'students' | 'staff' | 'classes' | 'finances' | 'transfers';

const BranchDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [branch, setBranch] = useState<BranchData | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [financials, setFinancials] = useState<FinancialData | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<any[]>([]);
    const [staffMembers, setStaff] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [transfers, setTransfers] = useState<any[]>([]);

    const canManage = ['SUPER_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '');

    useEffect(() => {
        if (id) {
            fetchBranchData();
        }
    }, [id]);

    const fetchBranchData = async () => {
        try {
            setLoading(true);
            const [branchRes, analyticsRes, financialsRes] = await Promise.all([
                api.get(`/branches/${id}`),
                api.get(`/branches/${id}/analytics`),
                api.get(`/branches/${id}/financial-summary`)
            ]);
            setBranch(branchRes.data);
            setAnalytics(analyticsRes.data);
            setFinancials(financialsRes.data);
        } catch (error) {
            console.error('Failed to fetch branch data', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const response = await api.get(`/students?branchId=${id}`);
            setStudents(response.data.students || response.data);
        } catch (error) {
            console.error('Failed to fetch students', error);
        }
    };

    const fetchStaff = async () => {
        try {
            const response = await api.get(`/users?branchId=${id}`);
            setStaff(response.data);
        } catch (error) {
            console.error('Failed to fetch staff', error);
        }
    };

    const fetchClasses = async () => {
        try {
            const response = await api.get(`/classes?branchId=${id}`);
            setClasses(response.data);
        } catch (error) {
            console.error('Failed to fetch classes', error);
        }
    };

    const fetchTransfers = async () => {
        try {
            const response = await api.get(`/branches/${id}/transfers`);
            setTransfers(response.data);
        } catch (error) {
            console.error('Failed to fetch transfers', error);
        }
    };

    useEffect(() => {
        if (activeTab === 'students' && students.length === 0) fetchStudents();
        if (activeTab === 'staff' && staffMembers.length === 0) fetchStaff();
        if (activeTab === 'classes' && classes.length === 0) fetchClasses();
        if (activeTab === 'transfers' && transfers.length === 0) fetchTransfers();
    }, [activeTab]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case 'INACTIVE': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
            case 'MAINTENANCE': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(amount);
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <RefreshCw className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    if (!branch) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500">Branch not found</p>
                <Link to="/branches" className="text-blue-600 hover:underline mt-2 inline-block">
                    Back to Branches
                </Link>
            </div>
        );
    }

    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'overview', label: 'Overview', icon: <Activity size={16} /> },
        { key: 'students', label: 'Students', icon: <GraduationCap size={16} /> },
        { key: 'staff', label: 'Staff', icon: <Users size={16} /> },
        { key: 'classes', label: 'Classes', icon: <BookOpen size={16} /> },
        { key: 'finances', label: 'Finances', icon: <CreditCard size={16} /> },
        { key: 'transfers', label: 'Transfers', icon: <ArrowRightLeft size={16} /> },
    ];

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/branches')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${branch.isMain ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                            <Building size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{branch.name}</h1>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(branch.status)}`}>
                                    {branch.status}
                                </span>
                                {branch.isMain && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Main</span>
                                )}
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-mono">{branch.code}</p>
                        </div>
                    </div>
                </div>
                {canManage && (
                    <button
                        onClick={() => navigate(`/branches/${id}/edit`)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Edit2 size={16} />
                        <span>Edit Branch</span>
                    </button>
                )}
            </div>

            {/* Contact Info */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
                <div className="flex flex-wrap gap-6">
                    {branch.address && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <MapPin size={16} />
                            <span>{branch.address}</span>
                        </div>
                    )}
                    {branch.phone && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Phone size={16} />
                            <span>{branch.phone}</span>
                        </div>
                    )}
                    {branch.email && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <Mail size={16} />
                            <span>{branch.email}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === tab.key
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                            }`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && analytics && (
                <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                    <GraduationCap className="text-blue-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.stats.students}</p>
                                    <p className="text-xs text-gray-500">Students</p>
                                </div>
                            </div>
                            {analytics.stats.capacityUtilization !== null && (
                                <div className="mt-3">
                                    <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-600 rounded-full"
                                            style={{ width: `${Math.min(analytics.stats.capacityUtilization, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{analytics.stats.capacityUtilization}% capacity</p>
                                </div>
                            )}
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                                    <Users className="text-purple-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.stats.users}</p>
                                    <p className="text-xs text-gray-500">Staff</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                                    <BookOpen className="text-green-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.stats.classes}</p>
                                    <p className="text-xs text-gray-500">Classes</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                                    <TrendingUp className="text-amber-600" size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.stats.attendanceRate}%</p>
                                    <p className="text-xs text-gray-500">Attendance Rate</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    {financials && (
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial Summary</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                    <p className="text-2xl font-bold text-green-600">{formatCurrency(Number(financials.summary.totalCollected))}</p>
                                    <p className="text-sm text-gray-500">Total Collected</p>
                                </div>
                                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                                    <p className="text-2xl font-bold text-red-600">{formatCurrency(financials.summary.outstanding)}</p>
                                    <p className="text-sm text-gray-500">Outstanding</p>
                                </div>
                                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                    <p className="text-2xl font-bold text-blue-600">{financials.summary.totalPayments}</p>
                                    <p className="text-sm text-gray-500">Transactions</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'students' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Students ({students.length})</h3>
                        <Link to={`/students?branchId=${id}`} className="text-blue-600 hover:underline text-sm">
                            View All →
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-slate-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adm No</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {students.slice(0, 10).map((student) => (
                                    <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3 text-gray-900 dark:text-white">{student.firstName} {student.lastName}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{student.admissionNumber}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{student.class?.name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {student.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'staff' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Staff Members ({staffMembers.length})</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-slate-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {staffMembers.map((staff) => (
                                    <tr key={staff.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3 text-gray-900 dark:text-white">{staff.fullName}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{staff.email}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                                {staff.role}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'classes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {classes.map((cls) => (
                        <div key={cls.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <h4 className="font-semibold text-gray-900 dark:text-white">{cls.name}</h4>
                            <p className="text-sm text-gray-500">Grade {cls.gradeLevel}</p>
                            <p className="text-sm text-gray-500">{cls._count?.students || 0} students</p>
                        </div>
                    ))}
                    {classes.length === 0 && (
                        <p className="col-span-full text-center text-gray-500 py-8">No classes found</p>
                    )}
                </div>
            )}

            {activeTab === 'finances' && financials && (
                <div className="space-y-6">
                    {/* Payment Methods Breakdown */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payments by Method</h3>
                        <div className="grid grid-cols-3 gap-4">
                            {financials.byMethod.map((item) => (
                                <div key={item.method} className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-xl">
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(Number(item.total))}</p>
                                    <p className="text-sm text-gray-500">{item.method.replace('_', ' ')}</p>
                                    <p className="text-xs text-gray-400">{item.count} payments</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'transfers' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Transfer History</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-slate-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {transfers.map((transfer) => (
                                    <tr key={transfer.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs ${transfer.entityType === 'STUDENT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                                {transfer.entityType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{transfer.fromBranch?.name}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{transfer.toBranch?.name}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{transfer.reason || '-'}</td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                            {new Date(transfer.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                                {transfers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No transfers found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchDetail;
