import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building, GraduationCap, Users, BookOpen, TrendingUp,
    Activity, DollarSign, X, Plus, BarChart3, GitCompare, Layers
} from 'lucide-react';
import api from '../../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    status: string;
    capacity?: number;
    _count?: {
        students: number;
        users: number;
        classes: number;
        payments: number;
    };
}

interface BranchAnalytics {
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
    summary: {
        totalCollected: number;
        totalPayments: number;
        outstanding: number;
    };
}

interface BranchComparisonProps {
    embedded?: boolean;
}

const BranchComparison = ({ embedded = false }: BranchComparisonProps) => {
    const navigate = useNavigate();
    const [allBranches, setAllBranches] = useState<Branch[]>([]);
    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [branchData, setBranchData] = useState<Map<string, { analytics: BranchAnalytics; financials: FinancialSummary }>>(new Map());
    const [loading, setLoading] = useState(true);
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        if (selectedBranches.length > 0) {
            fetchBranchData();
        }
    }, [selectedBranches]);

    const fetchBranches = async () => {
        try {
            setLoading(true);
            const response = await api.get('/branches?includeStats=true');
            setAllBranches(response.data);
            
            // Auto-select first 2 branches
            if (response.data.length >= 2) {
                setSelectedBranches([response.data[0].id, response.data[1].id]);
            } else if (response.data.length === 1) {
                setSelectedBranches([response.data[0].id]);
            }
        } catch (error) {
            console.error('Failed to fetch branches:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBranchData = async () => {
        try {
            setLoadingData(true);
            const newData = new Map();
            
            for (const branchId of selectedBranches) {
                const [analyticsRes, financialsRes] = await Promise.all([
                    api.get(`/branches/${branchId}/analytics`).catch(() => ({ data: null })),
                    api.get(`/branches/${branchId}/financial-summary`).catch(() => ({ data: null }))
                ]);
                
                if (analyticsRes.data && financialsRes.data) {
                    newData.set(branchId, {
                        analytics: analyticsRes.data,
                        financials: financialsRes.data
                    });
                }
            }
            
            setBranchData(newData);
        } catch (error) {
            console.error('Failed to fetch branch data:', error);
        } finally {
            setLoadingData(false);
        }
    };

    const addBranch = (branchId: string) => {
        if (selectedBranches.length < 4 && !selectedBranches.includes(branchId)) {
            setSelectedBranches([...selectedBranches, branchId]);
        }
    };

    const removeBranch = (branchId: string) => {
        setSelectedBranches(selectedBranches.filter(id => id !== branchId));
        const newData = new Map(branchData);
        newData.delete(branchId);
        setBranchData(newData);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(amount);
    };

    const getMetricColor = (value: number, max: number) => {
        const percentage = (value / max) * 100;
        if (percentage >= 80) return 'bg-green-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const availableBranches = allBranches.filter(b => !selectedBranches.includes(b.id));

    return (
        <div className={`${embedded ? '' : 'p-6'} space-y-6`}>
            {!embedded && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branch Comparison</h1>
                            <p className="text-gray-500 dark:text-gray-400">Compare performance across branches</p>
                        </div>
                        <button
                            onClick={() => navigate('/branches')}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                            Back to Branches
                        </button>
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
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm flex items-center gap-2"
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

            {/* Branch Selector */}
            {selectedBranches.length < 4 && availableBranches.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Add Branch to Compare (Max 4)
                    </label>
                    <select
                        onChange={(e) => {
                            if (e.target.value) {
                                addBranch(e.target.value);
                                e.target.value = '';
                            }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    >
                        <option value="">Select a branch...</option>
                        {availableBranches.map(branch => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name} ({branch.code})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Comparison Grid */}
            {selectedBranches.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                    <Building size={48} className="mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No branches selected</h3>
                    <p className="text-gray-500">Select branches to compare their performance</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {/* Branch Headers */}
                    <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4`}>
                        <div className="font-semibold text-gray-900 dark:text-white">Metric</div>
                        {selectedBranches.map(branchId => {
                            const branch = allBranches.find(b => b.id === branchId);
                            if (!branch) return null;
                            return (
                                <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Building size={20} className="text-blue-600" />
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">{branch.name}</p>
                                                <p className="text-xs text-gray-500">{branch.code}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeBranch(branchId)}
                                            className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {loadingData ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        </div>
                    ) : (
                        <>
                            {/* Students */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <GraduationCap size={18} />
                                    <span className="font-medium">Students</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const count = data?.analytics.stats.students || 0;
                                    const maxStudents = Math.max(...Array.from(branchData.values()).map(d => d.analytics.stats.students));
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{count}</p>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getMetricColor(count, maxStudents)}`}
                                                    style={{ width: `${maxStudents > 0 ? (count / maxStudents) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Staff */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <Users size={18} />
                                    <span className="font-medium">Staff</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const count = data?.analytics.stats.users || 0;
                                    const maxUsers = Math.max(...Array.from(branchData.values()).map(d => d.analytics.stats.users));
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{count}</p>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getMetricColor(count, maxUsers)}`}
                                                    style={{ width: `${maxUsers > 0 ? (count / maxUsers) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Classes */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <BookOpen size={18} />
                                    <span className="font-medium">Classes</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const count = data?.analytics.stats.classes || 0;
                                    const maxClasses = Math.max(...Array.from(branchData.values()).map(d => d.analytics.stats.classes));
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{count}</p>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getMetricColor(count, maxClasses)}`}
                                                    style={{ width: `${maxClasses > 0 ? (count / maxClasses) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Attendance Rate */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <Activity size={18} />
                                    <span className="font-medium">Attendance Rate</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const rate = data?.analytics.stats.attendanceRate || 0;
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{rate}%</p>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getMetricColor(rate, 100)}`}
                                                    style={{ width: `${rate}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Capacity Utilization */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <TrendingUp size={18} />
                                    <span className="font-medium">Capacity</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const capacity = data?.analytics.stats.capacityUtilization || 0;
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                                {capacity > 0 ? `${capacity}%` : 'N/A'}
                                            </p>
                                            {capacity > 0 && (
                                                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${
                                                            capacity >= 90 ? 'bg-red-500' :
                                                            capacity >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                                                        }`}
                                                        style={{ width: `${Math.min(capacity, 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Total Revenue */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <DollarSign size={18} />
                                    <span className="font-medium">Revenue Collected</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const revenue = data?.financials.summary.totalCollected || 0;
                                    const maxRevenue = Math.max(...Array.from(branchData.values()).map(d => d.financials.summary.totalCollected));
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-lg font-bold text-gray-900 dark:text-white mb-2">{formatCurrency(revenue)}</p>
                                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getMetricColor(revenue, maxRevenue)}`}
                                                    style={{ width: `${maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Outstanding */}
                            <div className={`grid grid-cols-${selectedBranches.length + 1} gap-4 items-center`}>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                    <DollarSign size={18} />
                                    <span className="font-medium">Outstanding</span>
                                </div>
                                {selectedBranches.map(branchId => {
                                    const data = branchData.get(branchId);
                                    const outstanding = data?.financials.summary.outstanding || 0;
                                    return (
                                        <div key={branchId} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                                            <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(outstanding)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default BranchComparison;
