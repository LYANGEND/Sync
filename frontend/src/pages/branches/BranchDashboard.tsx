import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building, TrendingUp, Users, GraduationCap, AlertTriangle,
    MapPin, Activity, DollarSign, ArrowUpRight, ArrowDownRight, BarChart3, GitCompare, Layers
} from 'lucide-react';
import api from '../../utils/api';

interface BranchSummary {
    id: string;
    name: string;
    code: string;
    status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
    isMain: boolean;
    capacity?: number;
    _count: {
        students: number;
        users: number;
        classes: number;
        payments: number;
    };
}

interface DashboardStats {
    totalBranches: number;
    activeBranches: number;
    totalStudents: number;
    totalStaff: number;
    averageCapacity: number;
    branchesNearCapacity: number;
}

interface BranchDashboardProps {
    embedded?: boolean;
}

const BranchDashboard = ({ embedded = false }: BranchDashboardProps) => {
    const navigate = useNavigate();
    const [branches, setBranches] = useState<BranchSummary[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const response = await api.get('/branches?includeStats=true');
            const branchData: BranchSummary[] = response.data;
            setBranches(branchData);

            // Calculate stats
            const totalStudents = branchData.reduce((sum, b) => sum + (b._count?.students || 0), 0);
            const totalStaff = branchData.reduce((sum, b) => sum + (b._count?.users || 0), 0);
            const branchesWithCapacity = branchData.filter(b => b.capacity);
            const avgCapacity = branchesWithCapacity.length > 0
                ? branchesWithCapacity.reduce((sum, b) => sum + ((b._count?.students || 0) / (b.capacity || 1)) * 100, 0) / branchesWithCapacity.length
                : 0;
            const nearCapacity = branchData.filter(b => 
                b.capacity && ((b._count?.students || 0) / b.capacity) >= 0.8
            ).length;

            setStats({
                totalBranches: branchData.length,
                activeBranches: branchData.filter(b => b.status === 'ACTIVE').length,
                totalStudents,
                totalStaff,
                averageCapacity: Math.round(avgCapacity),
                branchesNearCapacity: nearCapacity
            });
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getCapacityPercentage = (branch: BranchSummary) => {
        if (!branch.capacity) return null;
        return Math.round((branch._count.students / branch.capacity) * 100);
    };

    const getCapacityColor = (percentage: number | null) => {
        if (!percentage) return 'text-gray-500';
        if (percentage >= 90) return 'text-red-600';
        if (percentage >= 80) return 'text-yellow-600';
        return 'text-green-600';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className={`${embedded ? '' : 'p-6'} space-y-6`}>
            {!embedded && (
                <>
                    {/* Header */}
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branch Dashboard</h1>
                        <p className="text-gray-500 dark:text-gray-400">Overview of all branches and key metrics</p>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
                        <button
                            onClick={() => navigate('/branches')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            All Branches
                        </button>
                        <button
                            onClick={() => navigate('/branches/dashboard')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => navigate('/branches/analytics')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <BarChart3 size={16} />
                            Analytics
                        </button>
                        <button
                            onClick={() => navigate('/branches/comparison')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <GitCompare size={16} />
                            Compare
                        </button>
                        <button
                            onClick={() => navigate('/branches/bulk-operations')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <Layers size={16} />
                            Bulk Ops
                        </button>
                    </div>
                </>
            )}

            {/* Key Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                            <Building size={16} />
                            <span className="text-xs">Total Branches</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalBranches}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-green-500 mb-2">
                            <Activity size={16} />
                            <span className="text-xs">Active</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeBranches}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-blue-500 mb-2">
                            <GraduationCap size={16} />
                            <span className="text-xs">Total Students</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalStudents}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-purple-500 mb-2">
                            <Users size={16} />
                            <span className="text-xs">Total Staff</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalStaff}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-yellow-500 mb-2">
                            <TrendingUp size={16} />
                            <span className="text-xs">Avg Capacity</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.averageCapacity}%</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 text-red-500 mb-2">
                            <AlertTriangle size={16} />
                            <span className="text-xs">Near Capacity</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.branchesNearCapacity}</p>
                    </div>
                </div>
            )}

            {/* Branches at Risk */}
            {branches.filter(b => {
                const cap = getCapacityPercentage(b);
                return cap && cap >= 80;
            }).length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-500" />
                        <h3 className="font-semibold text-yellow-900 dark:text-yellow-200">Capacity Alerts</h3>
                    </div>
                    <div className="space-y-2">
                        {branches.filter(b => {
                            const cap = getCapacityPercentage(b);
                            return cap && cap >= 80;
                        }).map(branch => {
                            const cap = getCapacityPercentage(branch);
                            return (
                                <div key={branch.id} className="flex items-center justify-between text-sm">
                                    <span className="text-yellow-900 dark:text-yellow-200">{branch.name}</span>
                                    <span className={`font-semibold ${getCapacityColor(cap)}`}>
                                        {cap}% capacity ({branch._count.students}/{branch.capacity})
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Branch Performance Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Branch Performance</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Branch</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Status</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Students</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Staff</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Classes</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Capacity</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {branches.map(branch => {
                                const capacityPercentage = getCapacityPercentage(branch);
                                return (
                                    <tr key={branch.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                    branch.isMain
                                                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                }`}>
                                                    <Building size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">{branch.name}</p>
                                                    <p className="text-xs text-gray-500">{branch.code}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {branch.status === 'ACTIVE' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                    Active
                                                </span>
                                            ) : branch.status === 'MAINTENANCE' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                                    Maintenance
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-semibold text-gray-900 dark:text-white">{branch._count.students}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-gray-600 dark:text-gray-400">{branch._count.users}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-gray-600 dark:text-gray-400">{branch._count.classes}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {capacityPercentage !== null ? (
                                                <span className={`font-semibold ${getCapacityColor(capacityPercentage)}`}>
                                                    {capacityPercentage}%
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => navigate(`/branches/${branch.id}`)}
                                                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BranchDashboard;
