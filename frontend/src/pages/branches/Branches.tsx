import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building, Plus, MapPin, Users, GraduationCap, BookOpen,
    Settings, Search, Filter, MoreVertical, Check, X, Wrench,
    BarChart3, GitCompare, Layers
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
    };
}

interface BranchesProps {
    embedded?: boolean;
}

const Branches = ({ embedded = false }: BranchesProps) => {
    const navigate = useNavigate();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        email: '',
        capacity: '',
        isMain: false
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            setLoading(true);
            const response = await api.get('/branches?includeStats=true');
            setBranches(response.data);
        } catch (error) {
            console.error('Failed to fetch branches:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.name || !formData.code) return;

        try {
            setSaving(true);
            await api.post('/branches', {
                ...formData,
                capacity: formData.capacity ? parseInt(formData.capacity) : undefined
            });
            setShowCreateModal(false);
            setFormData({ name: '', code: '', address: '', phone: '', email: '', capacity: '', isMain: false });
            await fetchBranches();
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to create branch');
        } finally {
            setSaving(false);
        }
    };

    const filteredBranches = branches.filter(branch => {
        const matchesSearch = branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            branch.code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || branch.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Check size={12} /> Active
                    </span>
                );
            case 'INACTIVE':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        <X size={12} /> Inactive
                    </span>
                );
            case 'MAINTENANCE':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Wrench size={12} /> Maintenance
                    </span>
                );
            default:
                return null;
        }
    };

    const getCapacityPercentage = (branch: Branch) => {
        if (!branch.capacity || !branch._count) return null;
        return Math.round((branch._count.students / branch.capacity) * 100);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className={embedded ? '' : 'p-6'}>
            {!embedded && (
                <>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branches</h1>
                            <p className="text-gray-500 dark:text-gray-400">Manage school campuses and locations</p>
                        </div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={20} />
                            Add Branch
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit mb-6">
                        <button
                            onClick={() => navigate('/branches')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm"
                        >
                            All Branches
                        </button>
                        <button
                            onClick={() => navigate('/branches/dashboard')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <BarChart3 size={16} />
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

            {embedded && (
                <div className="flex justify-end mb-6">
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={20} />
                        Add Branch
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search branches..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-400" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    >
                        <option value="ALL">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="MAINTENANCE">Maintenance</option>
                    </select>
                </div>
            </div>

            {/* Branch Grid */}
            {filteredBranches.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                    <Building size={48} className="mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No branches found</h3>
                    <p className="text-gray-500 mb-4">Get started by creating your first branch</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Create Branch
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredBranches.map((branch) => {
                        const capacityPercentage = getCapacityPercentage(branch);

                        return (
                            <div
                                key={branch.id}
                                onClick={() => navigate(`/branches/${branch.id}`)}
                                className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all cursor-pointer group"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${branch.isMain
                                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                            }`}>
                                            <Building size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {branch.name}
                                            </h3>
                                            <span className="text-sm text-gray-500">{branch.code}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {branch.isMain && (
                                            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full">
                                                Main
                                            </span>
                                        )}
                                        {getStatusBadge(branch.status)}
                                    </div>
                                </div>

                                {/* Address */}
                                {branch.address && (
                                    <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                                        <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                                        <span className="line-clamp-2">{branch.address}</span>
                                    </div>
                                )}

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                                            <GraduationCap size={14} />
                                        </div>
                                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {branch._count?.students || 0}
                                        </div>
                                        <div className="text-xs text-gray-500">Students</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                                            <Users size={14} />
                                        </div>
                                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {branch._count?.users || 0}
                                        </div>
                                        <div className="text-xs text-gray-500">Staff</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
                                            <BookOpen size={14} />
                                        </div>
                                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {branch._count?.classes || 0}
                                        </div>
                                        <div className="text-xs text-gray-500">Classes</div>
                                    </div>
                                </div>

                                {/* Capacity Bar */}
                                {branch.capacity && capacityPercentage !== null && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            <span>Capacity</span>
                                            <span>{branch._count?.students || 0} / {branch.capacity} ({capacityPercentage}%)</span>
                                        </div>
                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${capacityPercentage >= 90
                                                        ? 'bg-red-500'
                                                        : capacityPercentage >= 70
                                                            ? 'bg-yellow-500'
                                                            : 'bg-green-500'
                                                    }`}
                                                style={{ width: `${Math.min(capacityPercentage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New Branch</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="e.g., North Campus"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code *</label>
                                <input
                                    type="text"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    maxLength={10}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    placeholder="e.g., NTH"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacity</label>
                                    <input
                                        type="number"
                                        value={formData.capacity}
                                        onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                        placeholder="e.g., 500"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isMain"
                                    checked={formData.isMain}
                                    onChange={(e) => setFormData({ ...formData, isMain: e.target.checked })}
                                    className="rounded"
                                />
                                <label htmlFor="isMain" className="text-sm text-gray-700 dark:text-gray-300">
                                    Set as main branch
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!formData.name || !formData.code || saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Creating...' : 'Create Branch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Branches;
