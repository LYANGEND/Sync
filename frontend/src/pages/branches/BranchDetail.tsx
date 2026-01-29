import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Building, Users, GraduationCap, BookOpen,
    CreditCard, Activity, MapPin, Phone, Mail, Edit2,
    RefreshCw, ArrowRightLeft, TrendingUp, Check, X, Wrench, Settings
} from 'lucide-react';
import api from '../../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
    isMain: boolean;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    capacity?: number;
    _count?: {
        users: number;
        students: number;
        classes: number;
        payments: number;
    };
}

interface Analytics {
    branch: Branch;
    stats: {
        students: number;
        users: number;
        classes: number;
        payments: number;
        attendanceRate: number;
        capacityUtilization: number | null;
    };
}

interface FinancialSummary {
    branchId: string;
    branchName: string;
    summary: {
        totalCollected: number;
        totalPayments: number;
        outstanding: number;
    };
    byMethod: Array<{ method: string; total: number; count: number }>;
}

interface Transfer {
    id: string;
    entityType: 'STUDENT' | 'USER';
    entityId: string;
    fromBranch: { id: string; name: string; code: string };
    toBranch: { id: string; name: string; code: string };
    reason?: string;
    createdAt: string;
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class?: { id: string; name: string };
    branchEnrollments: Array<{ isPrimary: boolean; enrollType: string }>;
}

interface Staff {
    id: string;
    fullName: string;
    email: string;
    role: string;
    branchAssignments: Array<{ isPrimary: boolean; role: string }>;
}

interface Class {
    id: string;
    name: string;
    teacher?: { id: string; fullName: string };
    _count: { students: number };
}

const BranchDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [branch, setBranch] = useState<Branch | null>(null);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [financials, setFinancials] = useState<FinancialSummary | null>(null);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'staff' | 'classes' | 'finances' | 'transfers'>('overview');
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        email: '',
        capacity: '',
        status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE',
        isMain: false
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (id) {
            fetchBranchData();
        }
    }, [id]);

    const fetchBranchData = async () => {
        try {
            setLoading(true);
            const [branchRes, analyticsRes, financialsRes, transfersRes, studentsRes, staffRes, classesRes] = await Promise.all([
                api.get(`/branches/${id}`),
                api.get(`/branches/${id}/analytics`).catch(() => ({ data: null })),
                api.get(`/branches/${id}/financial-summary`).catch(() => ({ data: null })),
                api.get(`/branches/${id}/transfers`).catch(() => ({ data: [] })),
                api.get(`/branches/${id}/students`).catch(() => ({ data: [] })),
                api.get(`/branches/${id}/users`).catch(() => ({ data: [] })),
                api.get(`/branches/${id}/classes`).catch(() => ({ data: [] }))
            ]);

            setBranch(branchRes.data);
            setAnalytics(analyticsRes.data);
            setFinancials(financialsRes.data);
            setTransfers(transfersRes.data || []);
            setStudents(studentsRes.data || []);
            setStaff(staffRes.data || []);
            setClasses(classesRes.data || []);
        } catch (error) {
            console.error('Failed to fetch branch data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Check size={14} /> Active
                    </span>
                );
            case 'INACTIVE':
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        <X size={14} /> Inactive
                    </span>
                );
            case 'MAINTENANCE':
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Wrench size={14} /> Maintenance
                    </span>
                );
            default:
                return null;
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(amount);
    };

    const handleEdit = () => {
        if (branch) {
            setEditForm({
                name: branch.name,
                code: branch.code,
                address: branch.address || '',
                phone: branch.phone || '',
                email: branch.email || '',
                capacity: branch.capacity?.toString() || '',
                status: branch.status,
                isMain: branch.isMain
            });
            setShowEditModal(true);
        }
    };

    const handleUpdate = async () => {
        if (!editForm.name || !editForm.code || !id) return;

        try {
            setSaving(true);
            await api.put(`/branches/${id}`, {
                ...editForm,
                capacity: editForm.capacity ? parseInt(editForm.capacity) : undefined
            });
            setShowEditModal(false);
            await fetchBranchData();
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to update branch');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!branch) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500">Branch not found</p>
                <button onClick={() => navigate('/branches')} className="mt-4 text-blue-600 hover:underline">
                    Back to Branches
                </button>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Building },
        { id: 'students', label: 'Students', icon: GraduationCap },
        { id: 'staff', label: 'Staff', icon: Users },
        { id: 'classes', label: 'Classes', icon: BookOpen },
        { id: 'finances', label: 'Finances', icon: CreditCard },
        { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
    ];

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/branches')}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{branch.name}</h1>
                        <span className="text-sm text-gray-500 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                            {branch.code}
                        </span>
                        {branch.isMain && (
                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full">
                                Main Branch
                            </span>
                        )}
                        {getStatusBadge(branch.status)}
                    </div>
                    {branch.address && (
                        <div className="flex items-center gap-2 text-gray-500 mt-1">
                            <MapPin size={14} />
                            <span className="text-sm">{branch.address}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={fetchBranchData}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    title="Refresh"
                >
                    <RefreshCw size={20} />
                </button>
                <button
                    onClick={() => navigate(`/branches/${id}/payments`)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                    <CreditCard size={16} />
                    Payment Report
                </button>
                <button
                    onClick={() => navigate(`/branches/${id}/settings`)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                    <Settings size={16} />
                    Settings
                </button>
                <button
                    onClick={handleEdit}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                    <Edit2 size={16} />
                    Edit
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-slate-700 mb-6">
                <nav className="flex gap-4 -mb-px overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
                                    <GraduationCap size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {analytics?.stats.students || branch._count?.students || 0}
                                    </p>
                                    <p className="text-sm text-gray-500">Students</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {analytics?.stats.users || branch._count?.users || 0}
                                    </p>
                                    <p className="text-sm text-gray-500">Staff</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 flex items-center justify-center">
                                    <BookOpen size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {analytics?.stats.classes || branch._count?.classes || 0}
                                    </p>
                                    <p className="text-sm text-gray-500">Classes</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400 flex items-center justify-center">
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {analytics?.stats.attendanceRate || 0}%
                                    </p>
                                    <p className="text-sm text-gray-500">Attendance</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact & Capacity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Contact Info */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Contact Information</h3>
                            <div className="space-y-3">
                                {branch.phone && (
                                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                                        <Phone size={18} />
                                        <span>{branch.phone}</span>
                                    </div>
                                )}
                                {branch.email && (
                                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                                        <Mail size={18} />
                                        <span>{branch.email}</span>
                                    </div>
                                )}
                                {branch.address && (
                                    <div className="flex items-start gap-3 text-gray-600 dark:text-gray-400">
                                        <MapPin size={18} className="mt-0.5" />
                                        <span>{branch.address}</span>
                                    </div>
                                )}
                                {!branch.phone && !branch.email && !branch.address && (
                                    <p className="text-gray-500 text-sm">No contact information available</p>
                                )}
                            </div>
                        </div>

                        {/* Capacity */}
                        {branch.capacity && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Capacity Utilization</h3>
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                                            {analytics?.stats.capacityUtilization || 0}%
                                        </p>
                                        <p className="text-gray-500">
                                            {branch._count?.students || 0} / {branch.capacity} students
                                        </p>
                                    </div>
                                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${(analytics?.stats.capacityUtilization || 0) >= 90
                                                ? 'bg-red-500'
                                                : (analytics?.stats.capacityUtilization || 0) >= 70
                                                    ? 'bg-yellow-500'
                                                    : 'bg-green-500'
                                                }`}
                                            style={{ width: `${Math.min(analytics?.stats.capacityUtilization || 0, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'finances' && financials && (
                <div className="space-y-6">
                    {/* Financial Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <TrendingUp size={24} />
                                <span className="text-green-100">Total Collected</span>
                            </div>
                            <p className="text-3xl font-bold">{formatCurrency(financials.summary.totalCollected)}</p>
                            <p className="text-green-100 text-sm mt-1">{financials.summary.totalPayments} payments</p>
                        </div>
                        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <CreditCard size={24} />
                                <span className="text-red-100">Outstanding</span>
                            </div>
                            <p className="text-3xl font-bold">{formatCurrency(financials.summary.outstanding)}</p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <Activity size={24} />
                                <span className="text-blue-100">Collection Rate</span>
                            </div>
                            <p className="text-3xl font-bold">
                                {financials.summary.totalCollected + financials.summary.outstanding > 0
                                    ? Math.round((financials.summary.totalCollected / (financials.summary.totalCollected + financials.summary.outstanding)) * 100)
                                    : 0}%
                            </p>
                        </div>
                    </div>

                    {/* By Payment Method */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">By Payment Method</h3>
                        <div className="space-y-3">
                            {financials.byMethod.map((method) => (
                                <div key={method.method} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <span className="font-medium text-gray-900 dark:text-white">{method.method.replace('_', ' ')}</span>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(method.total)}</p>
                                        <p className="text-xs text-gray-500">{method.count} payments</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'transfers' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Transfer History</h3>
                    </div>
                    {transfers.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <ArrowRightLeft size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No transfers recorded for this branch</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-slate-700">
                            {transfers.map((transfer) => (
                                <div key={transfer.id} className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${transfer.entityType === 'STUDENT'
                                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                            }`}>
                                            {transfer.entityType === 'STUDENT' ? <GraduationCap size={20} /> : <Users size={20} />}
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {transfer.entityType === 'STUDENT' ? 'Student' : 'Staff'} Transfer
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {transfer.fromBranch.name} → {transfer.toBranch.name}
                                            </p>
                                            {transfer.reason && (
                                                <p className="text-xs text-gray-400 mt-1">{transfer.reason}</p>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {new Date(transfer.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'students' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-slate-700/50">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Admission #</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Name</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Class</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {students.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No students found in this branch
                                        </td>
                                    </tr>
                                ) : (
                                    students.map((student) => {
                                        const enrollment = student.branchEnrollments.find(sb => !branch || sb.isPrimary /* logic simplification */) || student.branchEnrollments[0];
                                        return (
                                            <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                                <td className="px-6 py-4 font-mono text-gray-600 dark:text-gray-400">{student.admissionNumber}</td>
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {student.firstName} {student.lastName}
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                                                    {student.class?.name || 'Unassigned'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${enrollment?.enrollType === 'FULL_TIME'
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                        }`}>
                                                        {enrollment?.enrollType?.replace('_', ' ') || 'Enrolled'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'staff' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-slate-700/50">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Name</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Email</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Role</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {staff.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                            No staff assigned to this branch
                                        </td>
                                    </tr>
                                ) : (
                                    staff.map((member) => {
                                        const assignment = member.branchAssignments.find(ub => ub.isPrimary) || member.branchAssignments[0];
                                        return (
                                            <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{member.fullName}</td>
                                                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{member.email}</td>
                                                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{member.role}</td>
                                                <td className="px-6 py-4">
                                                    {assignment?.isPrimary ? (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                            Primary Branch
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                                            Secondary
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'classes' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-slate-700/50">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Class Name</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Teacher</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Students</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {classes.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                                            No classes in this branch
                                        </td>
                                    </tr>
                                ) : (
                                    classes.map((cls) => (
                                        <tr key={cls.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{cls.name}</td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                                                {cls.teacher?.fullName || 'Unassigned'}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                                                {cls._count.students} Students
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Edit Branch</h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch Name *</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code *</label>
                                    <input
                                        type="text"
                                        value={editForm.code}
                                        onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                                        maxLength={10}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                                <textarea
                                    value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={editForm.phone}
                                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacity</label>
                                    <input
                                        type="number"
                                        value={editForm.capacity}
                                        onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                                <select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                    <option value="MAINTENANCE">Maintenance</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="editIsMain"
                                    checked={editForm.isMain}
                                    onChange={(e) => setEditForm({ ...editForm, isMain: e.target.checked })}
                                    className="rounded"
                                />
                                <label htmlFor="editIsMain" className="text-sm text-gray-700 dark:text-gray-300">
                                    Set as main branch
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={!editForm.name || !editForm.code || saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchDetail;
