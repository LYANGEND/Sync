import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, TrendingUp, TrendingDown, Users, GraduationCap,
    Award, Target, BarChart3, Activity, DollarSign, GitCompare, Layers
} from 'lucide-react';
import api from '../../utils/api';

interface BranchPerformance {
    id: string;
    name: string;
    code: string;
    status: string;
    students: number;
    staff: number;
    classes: number;
    capacityUtilization: number | null;
    attendanceRate: number;
    revenue: number;
}

interface Rankings {
    byStudents: Array<{ id: string; name: string; value: number }>;
    byAttendance: Array<{ id: string; name: string; value: number }>;
    byRevenue: Array<{ id: string; name: string; value: number }>;
}

interface BranchAnalyticsProps {
    embedded?: boolean;
}

const BranchAnalytics = ({ embedded = false }: BranchAnalyticsProps) => {
    const navigate = useNavigate();
    const [branches, setBranches] = useState<BranchPerformance[]>([]);
    const [rankings, setRankings] = useState<Rankings | null>(null);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'students' | 'attendance' | 'revenue'>('students');

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const response = await api.get('/branches/analytics/performance');
            setBranches(response.data.branches);
            setRankings(response.data.rankings);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW' }).format(amount);
    };

    const getSortedBranches = () => {
        const sorted = [...branches];
        switch (sortBy) {
            case 'students':
                return sorted.sort((a, b) => b.students - a.students);
            case 'attendance':
                return sorted.sort((a, b) => b.attendanceRate - a.attendanceRate);
            case 'revenue':
                return sorted.sort((a, b) => b.revenue - a.revenue);
            default:
                return sorted;
        }
    };

    const getPerformanceColor = (value: number, max: number) => {
        const percentage = (value / max) * 100;
        if (percentage >= 80) return 'text-green-600 dark:text-green-400';
        if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    const getPerformanceIcon = (value: number, max: number) => {
        const percentage = (value / max) * 100;
        if (percentage >= 80) return <TrendingUp size={16} className="text-green-600" />;
        return <TrendingDown size={16} className="text-red-600" />;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const maxStudents = Math.max(...branches.map(b => b.students));
    const maxRevenue = Math.max(...branches.map(b => b.revenue));
    const sortedBranches = getSortedBranches();

    return (
        <div className={`${embedded ? '' : 'p-6'} space-y-6`}>
            {!embedded && (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/branches')}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branch Analytics</h1>
                            <p className="text-gray-500 dark:text-gray-400">Performance metrics and rankings</p>
                        </div>
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
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm flex items-center gap-2"
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

            {/* Top Performers */}
            {rankings && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Top by Students */}
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                        <div className="flex items-center gap-2 mb-4">
                            <GraduationCap size={24} />
                            <h3 className="font-semibold">Top by Students</h3>
                        </div>
                        <div className="space-y-3">
                            {rankings.byStudents.slice(0, 3).map((branch, idx) => (
                                <div key={branch.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold opacity-50">#{idx + 1}</span>
                                        <span className="text-sm">{branch.name}</span>
                                    </div>
                                    <span className="font-bold">{branch.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top by Attendance */}
                    <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                        <div className="flex items-center gap-2 mb-4">
                            <Activity size={24} />
                            <h3 className="font-semibold">Top by Attendance</h3>
                        </div>
                        <div className="space-y-3">
                            {rankings.byAttendance.slice(0, 3).map((branch, idx) => (
                                <div key={branch.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold opacity-50">#{idx + 1}</span>
                                        <span className="text-sm">{branch.name}</span>
                                    </div>
                                    <span className="font-bold">{branch.value}%</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top by Revenue */}
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign size={24} />
                            <h3 className="font-semibold">Top by Revenue</h3>
                        </div>
                        <div className="space-y-3">
                            {rankings.byRevenue.slice(0, 3).map((branch, idx) => (
                                <div key={branch.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-bold opacity-50">#{idx + 1}</span>
                                        <span className="text-sm">{branch.name}</span>
                                    </div>
                                    <span className="font-bold text-xs">{formatCurrency(branch.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sort Controls */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setSortBy('students')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                sortBy === 'students'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Students
                        </button>
                        <button
                            onClick={() => setSortBy('attendance')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                sortBy === 'attendance'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Attendance
                        </button>
                        <button
                            onClick={() => setSortBy('revenue')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                sortBy === 'revenue'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            Revenue
                        </button>
                    </div>
                </div>
            </div>

            {/* Performance Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Branch Performance Comparison</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Rank</th>
                                <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Branch</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Students</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Staff</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Classes</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Attendance</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Capacity</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Revenue</th>
                                <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Performance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                            {sortedBranches.map((branch, idx) => (
                                <tr
                                    key={branch.id}
                                    className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                                    onClick={() => navigate(`/branches/${branch.id}`)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {idx < 3 && <Award size={16} className="text-yellow-500" />}
                                            <span className="font-semibold text-gray-900 dark:text-white">#{idx + 1}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">{branch.name}</p>
                                            <p className="text-xs text-gray-500">{branch.code}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className={`font-semibold ${getPerformanceColor(branch.students, maxStudents)}`}>
                                                {branch.students}
                                            </span>
                                            {getPerformanceIcon(branch.students, maxStudents)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-400">
                                        {branch.staff}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-400">
                                        {branch.classes}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`font-semibold ${getPerformanceColor(branch.attendanceRate, 100)}`}>
                                            {branch.attendanceRate}%
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {branch.capacityUtilization !== null ? (
                                            <span className={`font-semibold ${
                                                branch.capacityUtilization >= 90 ? 'text-red-600' :
                                                branch.capacityUtilization >= 70 ? 'text-yellow-600' : 'text-green-600'
                                            }`}>
                                                {branch.capacityUtilization}%
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">N/A</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className={`font-semibold text-xs ${getPerformanceColor(branch.revenue, maxRevenue)}`}>
                                                {formatCurrency(branch.revenue)}
                                            </span>
                                            {getPerformanceIcon(branch.revenue, maxRevenue)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* Overall performance score */}
                                            {(() => {
                                                const studentScore = (branch.students / maxStudents) * 100;
                                                const attendanceScore = branch.attendanceRate;
                                                const revenueScore = (branch.revenue / maxRevenue) * 100;
                                                const overallScore = Math.round((studentScore + attendanceScore + revenueScore) / 3);
                                                
                                                return (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${
                                                                    overallScore >= 80 ? 'bg-green-500' :
                                                                    overallScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                                                }`}
                                                                style={{ width: `${overallScore}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-semibold">{overallScore}%</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BranchAnalytics;
